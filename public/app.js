document.addEventListener('DOMContentLoaded', () => {
  const nameInput = document.querySelector('#name')
  const connectButton = document.querySelector('#connect')
  const winningCards = document.querySelector('#winning-cards')
  const blackCards = document.querySelector('.black-cards')
  const sendCards = document.querySelector('.send-cards')
  const whiteCards = document.querySelector('.white-cards')
  var readyButton = document.getElementById('ready')
  const infoDisplay = document.getElementById('info')
  var startButton = document.getElementById('start-game')
  const playersText = document.getElementById('players')

  const MODE_NOT_CONNECTED = 1
  const MODE_CONNECTED = 2
  const MODE_DEALER = 3
  const MODE_PLAYER = 4
  const MODE_WAITING = 5

  let gameMode = MODE_NOT_CONNECTED
  var myWhiteCards = []
  let sendingCardsIdOrText = []
  let allPlayersReady = false

  let playerNum = -1
  let playerName
  let gSocket = null
  let clickedCards = 0
  let playerCount = 0

  let twoCardMode

  let draggedCard = null


  sendCards.addEventListener('drop', dragDropSend)
  whiteCards.addEventListener('drop', dragDropWhite)
  sendCards.addEventListener('dragover', dragOver)
  whiteCards.addEventListener('dragover', dragOver)

  // connect button click
  connectButton.addEventListener('click', () => {
    playerName = nameInput.value
    console.log(`gameMode: ${gameMode}`)

    if (playerName.length > 0) {
      if (gameMode == MODE_NOT_CONNECTED) {
        console.log(`connecting with playerName: $(playerName)`)
        connectButton.innerHTML = "Connected"
        connect()
        infoDisplay.innerHTML = "Please press ready"
      } else {
        //console.log(`playerName: $(playerName)`)
        //gSocket.emit('player-info', {name: playerName, num: playerNum})
      }

    } else infoDisplay.innerHTML = "Please enter your name"
  })


  // Connected
  function connect() {
    const socket = io();

    gSocket = socket
    gameMode = MODE_CONNECTED

    // Get your player number
    socket.on('player-number', num => {
      if (num === -1) {
        infoDisplay.innerHTML = "Sorry, the server is full"
      } else {
        playerNum = parseInt(num)

        console.log(`Player Number: ${playerNum}`)

        socket.emit('player-info', { name: playerName, num: playerNum })
      }
    })

    // Another player has connected or disconnected
    socket.on('player-info', players => {
      playerInfoUpdate(players)
      playerCount = players.length
    })

    socket.on('start-game', () => {
      startButton = clearAllEventListeners(startButton)
    })

    socket.on('mode-wait', who => {
      console.log(`Received mode-waiting with ${who}`)
      sendingCardsIdOrText = []
      infoDisplay.innerHTML = `Waiting  for ${who}${gameMode == MODE_CONNECTED ? ' press Start Game when all are ready' : ''}`
      console.log(`---------------press STart Game when all are ready`)
      gameMode = MODE_WAITING
    })

    socket.on('black-card', blackCard => {
      console.log(`Received black-card with ${blackCard}`)
      blackCard = fixBlackCard(blackCard)
      replaceCard(blackCards, 'black-card', 'card-text-white', [blackCard], false)
    })

    socket.on('mode-dealer', () => {
      console.log(`Received mode-dealer`)
      sendCards.innerHTML = ""
      sendingCardsIdOrText = []

      infoDisplay.innerHTML = "Pick the winner (drag the card up as you read them and DOUBLE click the winning card)"
      gameMode = MODE_DEALER
      clickedCards = 0
      twoCardMode = false
      console.log(`twoCardMode = ${twoCardMode}`)
    })

    var oldMessage = ''
    socket.on('popup', popup => {
      oldMessage = infoDisplay.innerHTML
      infoDisplay.innerHTML = `<p style="margin:0; color:red;">&nbsp;&nbsp;&nbsp;&nbsp;<b>${popup.text}</b</p>`
      setTimeout(function () {
        infoDisplay.innerHTML = oldMessage
      }, popup.timeout);
    })

    socket.on('mode-player', blackCard => {
      console.log(`Received mode-player with ${blackCard}`)
      sendCards.innerHTML = ""
      sendingCardsIdOrText = []
      blackCard = fixBlackCard(blackCard)
      replaceCard(blackCards, 'black-card', 'card-text-white', [blackCard], false)

      if (twoCardMode) infoDisplay.innerHTML = "Pick your TWO best card then press ready"
      else infoDisplay.innerHTML = "Pick your best card then press ready or DOUBLE click a card"
      startButton = clearAllEventListeners(startButton)
      gameMode = MODE_PLAYER
    })

    socket.on('send-cards', cardsList => {
      console.log(`Received send-cards with ${cardsList.length}`)
      myWhiteCards = cardsList
      replaceCard(whiteCards, 'white-card-hand', 'card-text-black', cardsList, true)
    })

    // On Timeout
    socket.on('timeout', () => {
      infoDisplay.innerHTML = 'You have reached the 10 minute limit'
    })

    socket.on('winner-info', info => {
      winningCards.innerHTML = info
      allPlayersReady = false
      draggedCard = null
    })

    socket.on('dropped-card', cardtext => {

      if (!sendingCardsIdOrText.includes(cardtext)) {
        sendCards.innerHTML += buildCard(sendingCardsIdOrText.length, "white-card-hand", "card-text-black", cardtext, false)
        sendingCardsIdOrText.push(cardtext)
      }
    })

    // connect button click
    readyButton.addEventListener('click', () => {

      if (gameMode == MODE_CONNECTED) {
        console.log('sending player-ready')
        socket.emit('player-ready')

        // Ready button click
        startButton.addEventListener('click', () => {
          if (allPlayersReady) {
            console.log('sending start-game')
            socket.emit('start-game')

          } else infoDisplay.innerHTML = "Please wait for players to be ready"
        })

      } else if (gameMode == MODE_DEALER || gameMode == MODE_PLAYER) {
        console.log(`sendingCardsIdOrText = ${sendingCardsIdOrText}  twocard:${twoCardMode}`)
        if (sendingCardsIdOrText.length == 1 && !twoCardMode) {
          let text = sendingCardsIdOrText[0]

          if (gameMode == MODE_PLAYER) {  //Player sends index
            text = text.substr(-1)
            sendCards.innerHTML = ''
            sendingCardsIdOrText = []
            whiteCards.innerHTML = buildCard(0, "white-card-hand", "card-text-black", myWhiteCards[parseInt(parseInt(text))], false)

          } else {
            //nop dealer send text
          }
          console.log(`sending send-cards ${text}`)
          socket.emit('send-cards', text)

        } else if (sendingCardsIdOrText.length == 2 && twoCardMode) {
          console.log(`Sending 2 ids`)
          if (gameMode == MODE_PLAYER) {  //Player sends index
            let id1 = parseInt(sendingCardsIdOrText[0].substr(-1))
            let id2 = parseInt(sendingCardsIdOrText[1].substr(-1))
            text = `${id1}-${id2}`
            sendCards.innerHTML = ''
            sendingCardsIdOrText = []
            whiteCards.innerHTML = buildCard(0, "white-card-hand", "card-text-black", myWhiteCards[id1], false) + buildCard(0, "white-card-hand", "card-text-black", myWhiteCards[id2], false)

          } else {
            //nop dealer send text
          }
          console.log(`sending send-cards ${text}`)
          socket.emit('send-cards', text)

        } else {
          if (twoCardMode) infoDisplay.innerHTML = "Pick a two cards before clicking ready"
          else infoDisplay.innerHTML = "Pick a single card before clicking ready"
        }

      }


    })

  }

  function buildCard(counter, divClass, textClass, cardText, draggable) {
    let drag = ''
    if (draggable) {
      drag = ' draggable="true"'
    }

    let html = `<div id="${divClass}-${counter}" class="${divClass}"${drag}><div class="${textClass}"><h4>${cardText}</h4></div></div>`

    return html
  }

  function fixBlackCard(text) {
    let text2 = text.replace('_222_', '___')
    if (text != text2) {
      twoCardMode = true
      console.log(`twoCardMode = ${twoCardMode}`)

      text = text2
      console.log(`TWO CARD MODE`)
    } else {
      twoCardMode = false
    }

    return text
  }

  function replaceCard(cardContainer, divClass, textClass, cardText, draggable) {

    //<div class="black-card"><div class="card-text-white"><h4>Best gift for a wife</h4></div></div>
    //<div class="white-card-hand"><div class="card-text-black"><h4>Biggest Blackist Dick</h4></div></div>
    //<div class="white-card-top"><div class="card-text-black"><h4>Biggest Blackist Dick</h4></div></div>
    console.log(`replacing in ${cardContainer.classList} ${cardText}`)

    while (cardContainer.lastElementChild) {
      cardContainer.removeChild(cardContainer.lastElementChild);
    }

    let html = ""
    let counter = 0
    cardText.forEach(text => {
      html += buildCard(counter, divClass, textClass, text, draggable)
      counter++
    })
    cardContainer.innerHTML = html

    if (draggable) {
      var children = cardContainer.children;
      for (var i = 0; i < children.length; i++) {
        var child = children[i];
        child.addEventListener('dragstart', dragStart)
        child.addEventListener('click', clickEvent)
      }
    }

  }

  function clearAllEventListeners(old_element) {
    var id = old_element.id
    var new_element = old_element.cloneNode(true)
    old_element.parentNode.replaceChild(new_element, old_element)

    return document.getElementById(id)
  }

  function playerInfoUpdate(players) {
    console.log(`in playerInfoUpdate ${JSON.stringify(players)}`)
    allPlayersReady = true

    let playerString = "<b>Players:</b> "
    let counter = 0
    let dealer = null

    players.forEach(player => {
      //if (counter > 0) playerString += ", "
      if (player.state != 'dealer') playerString += `<br> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${player.name} - Wins: ${player.winCount}${player.state == 'READY' ? " &nbsp;&nbsp;&nbsp;&nbsp;(READY)" : ''}${player.state.includes('connected') ? " &nbsp;&nbsp;&nbsp;&nbsp;(NOT READY)" : ''}`
      else dealer = player
      counter++
      if (player.state == "connected" || player.state == 'disconnected') allPlayersReady = false
    })

    if (counter < 2) allPlayersReady = false

    console.log(`recieved ${counter} players all ready: ${allPlayersReady}`)

    if (dealer != null) {
      playersText.innerHTML = `<b>Dealer:</b> &nbsp;&nbsp;&nbsp;${dealer.name} - Wins: ${dealer.winCount}<br>${playerString}`
    } else {
      playersText.innerHTML = playerString
    }
  }

  function dragStart() {
    draggedCard = this
    console.log(`Drag Start ${draggedCard.id}`)
  }

  function dragOver(e) {
    if (gameMode == MODE_PLAYER || gameMode == MODE_DEALER) e.preventDefault()
  }

  function dragDropSend() {


    let cardIndex = draggedCard.id.substr(-1)
    let cardText = myWhiteCards[parseInt(cardIndex)]
    sendCards.appendChild(draggedCard)

    if (gameMode == MODE_DEALER) gSocket.emit('dropped-card', cardText)

    if (gameMode == MODE_DEALER) sendingCardsIdOrText.push(cardText)
    else sendingCardsIdOrText.push(draggedCard.id)

    console.log(`dragDropSend = ${sendingCardsIdOrText}  twocard:${twoCardMode}`)

  }

  function dragDropWhite() {
    console.log(`Removing ${draggedCard.id}`)

    let cardIndex = draggedCard.id.substr(-1)
    let cardText = myWhiteCards[parseInt(cardIndex)]
    whiteCards.appendChild(draggedCard)

    if (gameMode == MODE_PLAYER) sendingCardsIdOrText = sendingCardsIdOrText.filter(text => text != draggedCard.id)
    else sendingCardsIdOrText = sendingCardsIdOrText.filter(text => text != cardText)

    console.log(`dragDropWhite = ${sendingCardsIdOrText}  twocard:${twoCardMode}`)

  }

  function doubleClick(card) {

    if (card == null) return

    let cardIndex = card.id.substr(-1)
    let cardText = myWhiteCards[parseInt(cardIndex)]

    if (gameMode == MODE_DEALER) {
      if (clickedCards >= playerCount) {
        console.log(`sending send-cards ${cardText}`)
        gSocket.emit('send-cards', cardText)
      }

    } else if (gameMode == MODE_PLAYER) {
      console.log(`sending send-cards ${cardIndex}`)
      gSocket.emit('send-cards', cardIndex)

      sendCards.innerHTML = ''
      sendingCardsIdOrText = []
      whiteCards.innerHTML = buildCard(0, "white-card-hand", "card-text-black", cardText, false)

    }
  }

  let clickedCard = null
  let clicks = 0
  let timeout = null
  function clickEvent() {

    if (gameMode != MODE_DEALER && gameMode != MODE_PLAYER) return

    clicks++;
    if (clickedCard != null && this != clickedCard) {
      clicks = 1
      if (timeout != null) {
        clearTimeout(timeout)
        console.log('clearTimeout')
      }
    }
    clickedCard = this
    console.log(`clicks: ${clicks} ${clickedCard.id}`)

    if (clicks == 1) {

      timeout = setTimeout(function () {
        if (clicks == 1) {
          click(clickedCard);
        } else {
          doubleClick(clickedCard);
        }
        clicks = 0;
        clickedCard = null
        clearTimeout(timeout)
        timeout = null
      }, 300);

    }
  }

  function click(card) {

    if (card == null) return

    console.log(`click = ${card.id} ${card.parentNode.classList} ${sendingCardsIdOrText}  twocard:${twoCardMode}`)

    let classes = card.parentNode.classList

    if (classes.contains('send-cards')) {
      let cardIndex = card.id.substr(-1)
      let cardText = myWhiteCards[parseInt(cardIndex)]
      whiteCards.appendChild(card)

      if (gameMode == MODE_PLAYER) sendingCardsIdOrText = sendingCardsIdOrText.filter(text => text != card.id)
      else sendingCardsIdOrText = sendingCardsIdOrText.filter(text => text != cardText)

    } else if (classes.contains('white-cards')) {

      let cardIndex = card.id.substr(-1)
      let cardText = myWhiteCards[parseInt(cardIndex)]
      sendCards.appendChild(card)
      clickedCards++

      if (gameMode == MODE_DEALER) gSocket.emit('dropped-card', cardText)

      if (gameMode == MODE_DEALER) sendingCardsIdOrText.push(cardText)
      else sendingCardsIdOrText.push(card.id)

    }
    console.log(`sendingCardsIdOrText = ${sendingCardsIdOrText}`)
  }

})
