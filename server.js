const express = require('express')
const path = require('path')
const http = require('http')
const socketio = require('socket.io')
const fs = require('fs');
const { disconnect } = require('process');
const { compileFunction } = require('vm');

const app = express()
const server = http.createServer(app)
const io = socketio(server)
const PORT = process.env.PORT || 20202

const MODE_CONNECTING = 1
const MODE_WAITING_WHITE_CARDS = 2
const MODE_WAITING_DEALER = 3

let mode = MODE_CONNECTING
const blackCards = []
const whiteCards = []
let currentBlackCard = null
let currentDealer = null
let lastDummyCard = null
let twoCardMode = false

//player info: name, winningCards, whiteCards, socket, state(connected, ready, player, dealer)
const players = [null, null, null, null, null]  //Max 5 for now
let dealer = -1

loadCards()

// Set static folder
app.use(express.static(path.join(__dirname, "public")))

// Start server
server.listen(PORT, () => console.log(`Server running on port ${PORT}`))

io.on('connection', socket => {

  // Find an available player number
  let playerIndex = -1;

  let diconnectectIndex = findDisconnected()

  if (diconnectectIndex >= 0) {
    playerIndex = diconnectectIndex

  } else if (mode == MODE_CONNECTING) {
    for (const i in players) {
      if (players[i] === null) {
        playerIndex = i
        break
      }
    }
  }

  // Tell the connecting client what player number they are
  socket.emit('player-number', playerIndex)

  console.log(`Player ${playerIndex} has connected`)

  // Ignore player too many players
  if (playerIndex === -1) {
    socket.disconnect()
    return
  }

  updatePlayer(playerIndex, null, 'connected', null, socket)

  // get player info/name
  socket.on('player-info', player => {
    let index = parseInt(player.num)

    console.log(`updating player: ${JSON.stringify(player)}`)
    let newIndex = updatePlayer(index, player.name, null, null, socket)

    if (newIndex != playerIndex) {
      console.log(`sending new index to player`)
      playerIndex = newIndex
      socket.emit('player-number', playerIndex) //replace number if needed
    }

    sendPlayerInfo(socket)
  })


  // Handle Diconnect
  socket.on('disconnect', () => {
    console.log(`updating player: disconnect`)
    updatePlayer(playerIndex, null, 'disconnected', null, null)

    sendPlayerInfo(socket)
    socket.broadcast.emit('popup', { text: `Player ${players[playerIndex].name} disconnected`, timeout: 10000 })

    console.log(`Player ${playerIndex} disconnected`)

  })

  // On Ready
  socket.on('player-ready', () => {
    console.log(`updating player: ready`)
    updatePlayer(playerIndex, null, 'ready', null, null)
    socket.emit('mode-wait', 'players')
    sendPlayerInfo(socket)

    if (mode == MODE_WAITING_WHITE_CARDS) {
      socket.emit('start-game')
      currentDealer.state = 'dealer'

      players.forEach(player => {
        if (player != null) {
          if (player.state == 'dealer') {
            player.socket.emit('send-cards', player.whiteCards)
            player.socket.emit('mode-wait', 'players')
            player.socket.emit('black-card', currentBlackCard)
            player.socket.emit('mode-wait', 'players')

          } else {
            player.socket.emit('black-card', currentBlackCard)
            if (player.whiteCards.length < 10) {
              sendWhiteCards(player)
            } else {
              player.socket.emit('send-cards', player.whiteCards)
            }
            player.socket.emit('mode-player', currentBlackCard)
          }
        }
      })
      sendPlayerInfo(socket)
    }

    if (mode == MODE_WAITING_DEALER) {
      socket.emit('start-game')
      currentDealer.state = 'dealer'

      let cards = []
      let dealer = null

      players.forEach(player => {
        if (player != null) {
          if (player.state == 'dealer') dealer = player
          else {
            cards.push(player.whiteCards[player.selectedWhite])
            player.socket.emit('black-card', currentBlackCard)
            player.socket.emit('send-cards', [player.whiteCards[player.selectedWhite]])
            player.socket.emit('mode-wait', 'dealer')
          }
        }
      })

      cards.push(lastDummyCard)
      shuffle(cards)

      dealer.socket.emit('mode-dealer')
      dealer.socket.emit('send-cards', cards)
      sendPlayerInfo(socket)
    }

  })

  socket.on('start-game', () => {
    console.log('starting game')
    startGame(socket)
  })

  socket.on('send-cards', card => {
    console.log(`received send-cards ${card}`)
    socket.emit('mode-wait', 'players')

    if (mode == MODE_WAITING_WHITE_CARDS) {
      if (twoCardMode) {
        let cards = card.split('-')
        players[playerIndex].selectedWhite = parseInt(cards[0])  //index
        players[playerIndex].selectedWhite2 = parseInt(cards[1])  //index
        console.log(`player sel = ${players[playerIndex].selectedWhite} and ${players[playerIndex].selectedWhite2}`)
        checkWhiteCards(socket)
  
      } else {
        players[playerIndex].selectedWhite = parseInt(card)  //index
        players[playerIndex].selectedWhite2 = -1             //index
        checkWhiteCards(socket)
  
      }

    } else if (mode == MODE_WAITING_DEALER) {
      sendWinner(card, socket)     //text
    }

  })

  socket.on('dropped-card', cardtext => {
    socket.broadcast.emit('dropped-card', cardtext)
  })

  // Timeout connection
  // setTimeout(() => {
  //   console.log(`updating player: timeout`)
  //   updatePlayer(playerIndex, null, 'disconnected', null, null)

  //   sendPlayerInfo(socket)

  //   socket.emit('timeout')
  //   socket.disconnect()
  // }, 600000) // 10 minute limit per player
})

function checkWhiteCards(socket) {
  let countNeeded = 0
  let dealer
  let cards = []

  players.forEach(player => {
    if (player != null) {
      if (player.state == 'dealer') dealer = player
      else if (player.selectedWhite == -1) countNeeded++
      else {
        if (twoCardMode) {
          cards.push(buildTwoWhiteCards(player))

        } else {
          cards.push(player.whiteCards[player.selectedWhite])

        }
      }
    }
  })

  lastDummyCard = getCard(whiteCards)
  if (twoCardMode) {
    let lastDummyCard2 = getCard(whiteCards)
    cards.push(buildTwoWhiteCards2(lastDummyCard, lastDummyCard2))

  } else {
    cards.push(lastDummyCard)

  }
  console.log(`countNeeded = ${countNeeded} ${cards}`)

  shuffle(cards)
  console.log(`shuffled = ${cards}`)

  if (countNeeded == 0) {
    mode = MODE_WAITING_DEALER
    dealer.socket.emit('mode-dealer')
    dealer.socket.emit('send-cards', cards)

    players.forEach(player => {
      if (player != null) {
        if (player.state != 'dealer') player.socket.emit('mode-wait', 'dealer')
      }
    })
    sendPlayerInfo(socket)
  } else {
    sendPlayerInfo(socket)
  }
}

function buildTwoWhiteCards(player) {
  return buildTwoWhiteCards2(player.whiteCards[player.selectedWhite], player.whiteCards[player.selectedWhite2])
}

function buildTwoWhiteCards2(card1, card2) {
  return `1. ${card1}<br>2. ${card2}`;
}

function sendWinner(winnerText, socket) {
  winningPlayer = clearUsedWhiteCardsAndFindWinner(winnerText)

  if (winningPlayer != null) winningPlayer.winningCards.push(currentBlackCard)

  currentBlackCard = getCard(blackCards)
  let text2 = currentBlackCard.replace('_222_', '___')
  if (currentBlackCard != text2) {
    twoCardMode = true
    console.log(`twoCardMode = ${twoCardMode}`)
  } else {
    twoCardMode = false
  }


  let firstPlayer = null
  let nextPlayerAfterDealer = null
  let foundDealer = false

  players.forEach(player => {
    if (player != null) {
      console.log(`before ${player.name} ${player.state}  ${foundDealer} ${firstPlayer!=null} ${nextPlayerAfterDealer!=null}`)
      if (firstPlayer == null) firstPlayer = player
      if (nextPlayerAfterDealer == null && foundDealer) nextPlayerAfterDealer = player

      if (player.state == 'dealer') {
        foundDealer = true
      }
      player.state = 'player'
      sendWhiteCards(player)
      player.socket.emit('mode-player', currentBlackCard)
      console.log(`after ${player.name} ${player.state}  ${foundDealer} ${firstPlayer!=null} ${nextPlayerAfterDealer!=null}`)

    }
  })

  if (nextPlayerAfterDealer != null) {
    currentDealer = nextPlayerAfterDealer

  } else {
    currentDealer = firstPlayer
  }

  dealerName = currentDealer.name
  console.log(`Dealer is ${dealerName}`)
  currentDealer.socket.emit('mode-wait', 'players')
  currentDealer.socket.emit('black-card', currentBlackCard)
  currentDealer.state = 'dealer'

  sendPlayerInfo(socket)

  let winnerName = 'NO ONE'
  if (winningPlayer != null) winnerName = winningPlayer.name

  players.forEach(player => {
    if (player != null) {
      if (player === winningPlayer) player.socket.emit('winner-info', `Win Count: ${player.winningCards.length}  Last Winner: YOU!!!`)
      else player.socket.emit('winner-info', `Win Count: ${player.winningCards.length}  Last Winner: ${winnerName}`)
    }
  })

  let text = ''
  if (winningPlayer != null) {
    text = `Winner: ${winnerName} with card: ${winnerText}`
  } else {
    text = `Winning card: ${winnerText} (Dummy Card)`
  }
  socket.emit('popup', { text: text, timeout: 7000 })
  socket.broadcast.emit('popup', { text: text, timeout: 7000 })
  mode = MODE_WAITING_WHITE_CARDS
}

function clearUsedWhiteCardsAndFindWinner(winnerText) {
  let winningPlayer = null

  players.forEach(player => {
    if (player != null && player.selectedWhite != -1) {
      let cardText = player.whiteCards[player.selectedWhite]
      if (twoCardMode) {
        cardText = buildTwoWhiteCards(player)
      }
    
      player.whiteCards.splice(player.selectedWhite, 1)
      if (twoCardMode) {
        player.whiteCards.splice(player.selectedWhite2, 1)
        console.log(`removing white card ${cardText} from ${player.name}`)

      } else {
        console.log(`removing white card ${cardText} from ${player.name}`)

      }
      if (cardText == winnerText) winningPlayer = player
      player.selectedWhite = -1
    }
  })

  return winningPlayer
}

function startGame(socket) {
  //pick dealer
  let counter = 0
  players.forEach(player => {
    if (player != null) {
      counter++
      player.socket.emit('start-game')
    }
  })

  let dealer = Math.floor(Math.random() * counter)
  console.log(`Dealer index ${dealer}`)

  currentBlackCard = getCard(blackCards)

  let text2 = currentBlackCard.replace('_222_', '___')
  if (currentBlackCard != text2) {
    twoCardMode = true
    console.log(`twoCardMode = ${twoCardMode}`)
  } else {
    twoCardMode = false
  }

  let dealerName = ""
  counter = 0
  players.forEach(player => {
    if (player != null) {
      if (counter == dealer) {
        currentDealer = player
        dealerName = player.name
        player.state = 'dealer'
        sendWhiteCards(player)
        player.socket.emit('mode-wait', 'players')
        player.socket.emit('black-card', currentBlackCard)

      } else {
        player.state = 'player'
        player.socket.emit('mode-player', currentBlackCard)
        sendWhiteCards(player)
      }
      counter++
    }
  })

  console.log(`Dealer is ${dealerName}`)
  sendPlayerInfo(socket)
  mode = MODE_WAITING_WHITE_CARDS

}

function sendWhiteCards(player) {
  let num = 10 - player.whiteCards.length

  for (let i = 0; i < num; i++) {
    player.whiteCards.push(getCard(whiteCards))
  }
  console.log(`white cards ${player.whiteCards}`)
  player.socket.emit('send-cards', player.whiteCards)
}

function updatePlayer(index, name, state, winningCard, socket) {

  if (name != null) {
    for (const i in players) {
      if (players[i] != null && name == players[i].name && index != i) {
        console.log(`Found player with same name ${name}`)
        players[index] = null
        index = i
        state = 'connected'
        break
      }
    }
  }

  if (players[index] == null) {
    players[index] = []
    players[index].winningCards = []
    players[index].whiteCards = []
    players[index].selectedWhite = -1
    players[index].selectedWhite2 = -1
    players[index].name = null
  }

  if (name != null) players[index].name = name
  if (state != null) players[index].state = state
  if (winningCard != null) players[index].winningCards.push(winningCard)
  if (socket != null) players[index].socket = socket

  return index
}

function findDisconnected() {

  let disc = -1
  let index = -1
  players.forEach(player => {
    if (player != null) {
      index++
      if (player.state == 'disconnected') {
        disc = index
      }
    }
  })

  return disc
}

function sendPlayerInfo(socket) {
  //player info: name, winningCards, whiteCards, state(connected, ready, player, dealer)

  let playerInfo = []

  players.forEach(player => {
    if (player != null) {
      if (mode == MODE_WAITING_WHITE_CARDS) {
        let state = player.state
        if (player.selectedWhite >= 0) state = 'READY'
        playerInfo.push({ name: player.name, state: state, winCount: player.winningCards.length })

      } else {
        playerInfo.push({ name: player.name, state: player.state, winCount: player.winningCards.length })

      }
    }
  })

  socket.emit('player-info', playerInfo)
  socket.broadcast.emit('player-info', playerInfo)
}

function loadCards() {
  console.log("loading cards")

  var data = fs.readFileSync('cah-cards-full.json');

  console.log(`Read ${data.length} characters`)

  let jdata = JSON.parse(data)
  const len = Object.keys(jdata).length
  console.log(`Read ${len}`)

  let wcounter = 0
  let bcounter = 0

  for (var i = 0; i < len; i++) {
    jdata2 = jdata[i]
    if (jdata2.name.substring(0, 3) == 'CAH' || jdata2.name.substring(0, 6) == 'Cards ') {
      console.log(`${i} name: ${jdata2.name}`)

      let white = jdata2.white

      white.forEach(card => {
        if (isInDeck(whiteCards, card.text)) console.log(`found duplicate white ${card.text}`)
        else {
          whiteCards.push(String(card.text))
          wcounter++
        }
      })

      let black = jdata2.black
      black.forEach(card => {
        if (isInDeck(blackCards, card.text)) console.log(`found duplicate black ${card.text}`)
        else {
          let text = card.text
          text = text.replace('_', '+++')
          let text2 = text.replace('_', '_222_')
          if (text != text2) {
            text = text2.replace('+++', '___')
            blackCards.push(String(text))
            bcounter++

          } else {
            text = text.replace('+++', '___')
            blackCards.push(String(text))
            bcounter++

          }
        }
      })

    }

  }

  console.log(`Loaded ${wcounter} white cards and ${bcounter} black cards`)

  // let array = []
  // for(var i = 0; i < 2; i++) {
  //   array.push(getCard(whiteCards))
  // }
  // console.log(array)
  // shuffle(array)
  // console.log(array)

}

function isInDeck(cardDeck, text) {

  cardDeck.forEach(card => {
    if (card == text) return true
  })
}

function getCard(cardDeck) {
  let cardNum = Math.floor(Math.random() * cardDeck.length)

  let cardText = cardDeck[cardNum]
  cardDeck.splice(cardNum, 1)

  console.log(`Card from deck card ${cardText}`)
  return cardText
}

function shuffle(array) {
  var currentIndex = array.length, temporaryValue, randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    console.log(`random index ${randomIndex}`)
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}
