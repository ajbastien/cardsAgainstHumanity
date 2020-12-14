const express = require('express')
const path = require('path')
const http = require('http')
const socketio = require('socket.io')
const fs = require('fs');

const app = express()
const server = http.createServer(app)
const io = socketio(server)
const PORT = process.env.PORT || 3000

const MODE_CONNECTING = 1
const MODE_WAITING_WHITE_CARDS = 2
const MODE_WAITING_DEALER = 3

let mode = MODE_CONNECTING
const blackCards = []
const whiteCards = []
let currentBlackCard = null
let currentDealer = null

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
  for (const i in players) {
    if (players[i] === null) {
      playerIndex = i
      break
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

    console.log(`Player ${playerIndex} disconnected`)

  })

  // On Ready
  socket.on('player-ready', () => {
    console.log(`updating player: ready`)
    updatePlayer(playerIndex, null, 'ready', null, null)
    socket.emit('mode-wait', 'players')

    sendPlayerInfo(socket)
  })

  socket.on('start-game', () => {
    console.log('starting game')
    startGame(socket)
  })

  socket.on('send-cards', card => {
    console.log(`received send-cards ${card}`)
    socket.emit('mode-wait', 'players')

    if (mode == MODE_WAITING_WHITE_CARDS) {
      players[playerIndex].selectedWhite = parseInt(card)  //index
      checkWhiteCards(socket)

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
      else cards.push(player.whiteCards[player.selectedWhite])  
    }
  })

  cards.push(getCard(whiteCards))
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
  
  }
}

function sendWinner(winnerText, socket) {
  winningPlayer = clearUsedWhiteCardsAndFindWinner(winnerText)

  if (winningPlayer != null) winningPlayer.winningCards.push(currentBlackCard)

  currentBlackCard = getCard(blackCards)

  let firstPlayer = null
  let nextPlayerAfterDealer = null
  let foundDealer = false

  players.forEach(player => {
    if (player != null) {
      if (firstPlayer == null) firstPlayer = player
      if (nextPlayerAfterDealer == null && foundDealer) nextPlayerAfterDealer = player

      if (player.state == 'dealer') {
        foundDealer = true
      }
      player.state = 'player'
      sendWhiteCards(player)
      player.socket.emit('mode-player', currentBlackCard)
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
      if (player === winningPlayer) player.socket.emit('winner-info', `WINNER!!  Win Count: ${player.winningCards.length}`)
      else player.socket.emit('winner-info', `Win Count: ${player.winningCards.length}  Last Winner: ${winnerName}`)
    }
  })

  mode = MODE_WAITING_WHITE_CARDS
}

function clearUsedWhiteCardsAndFindWinner(winnerText) {
  let winningPlayer = null
  
  players.forEach( player => {
    if (player != null && player.selectedWhite != -1) {
      let cardText = player.whiteCards[player.selectedWhite]
      player.whiteCards.splice(player.selectedWhite, 1)
      console.log(`removing white card ${cardText} from ${player.name}`)
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

  let dealer = Math.floor(Math.random()*counter)
  console.log(`Dealer index ${dealer}`)

  currentBlackCard = getCard(blackCards)

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

  for(let i = 0; i < num; i++) {
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
    players[index].name = null
  }

  if (name != null) players[index].name = name
  if (state != null) players[index].state = state
  if (winningCard != null) players[index].winningCards.push(winningCard)
  if (socket != null) players[index].socket = socket

  return index
}


function sendPlayerInfo(socket) {
  //player info: name, winningCards, whiteCards, state(connected, ready, player, dealer)

  let playerInfo = []

  players.forEach(player => {
    if (player != null) {
      playerInfo.push({name: player.name, state: player.state, winCount: player.winningCards.length})
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

  for(var i = 0; i < len; i++) {
    jdata2 = jdata[i]
    if (jdata2.name.substring(0, 3) == 'CAH' || jdata2.name.substring(0, 6) == 'Cards ') {
      console.log(`${i} name: ${jdata2.name}`)

      let white = jdata2.white

      white.forEach(card => {
        if (isInDeck(whiteCards, card.text)) console.log(`found duplicate white ${card.text}`)
        else {
          whiteCards.push(card.text)
          wcounter++
        }
      })

      let black = jdata2.black
      black.forEach(card => {
        if (isInDeck(blackCards, card.text)) console.log(`found duplicate black ${card.text}`)
        else {
          blackCards.push(card.text)
          bcounter++
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

  cardDeck.forEach( card => {
    if (card == text) return true
  })
}

function getCard(cardDeck) {
  let cardNum = Math.floor(Math.random()*cardDeck.length)

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
