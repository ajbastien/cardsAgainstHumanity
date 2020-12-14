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
  let dealerCards = []
  let allPlayersReady = false

  let playerNum = -1
  let playerName
  let gSocket = null

  let draggedCard = null
  let lastDroppedCardId = null


  sendCards.addEventListener('drop', dragDropSend)
  whiteCards.addEventListener('drop', dragDropWhite)
  sendCards.addEventListener('dragover', dragOver)
  whiteCards.addEventListener('dragover', dragOver)

  // connect button click
  connectButton.addEventListener('click', () => {
    playerName = nameInput.value
    console.log(`gameMode: ${gameMode}`)

    if(playerName.length > 0) {
      if (gameMode == MODE_NOT_CONNECTED) {
        console.log(`connecting with playerName: $(playerName)`)
        connectButton.innerHTML = "Rename"
        connect()
        infoDisplay.innerHTML = "Please press ready"
      } else {
        console.log(`playerName: $(playerName)`)
        gSocket.emit('player-info', {name: playerName, num: playerNum})
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

        socket.emit('player-info', {name: playerName, num: playerNum})
      }
    })

    // Another player has connected or disconnected
    socket.on('player-info', players => {
      playerInfoUpdate(players)
      sendCards.innerHTML = ""
    })

    socket.on('start-game', ()  => {
      startButton = clearAllEventListeners(startButton)
    })

    socket.on('mode-wait', who => {
      console.log(`Received mode-waiting with ${who}`)
      dealerCards = []
      infoDisplay.innerHTML = `Waiting on ${who}`
      gameMode = MODE_WAITING
    }) 

    socket.on('black-card', blackCard => {
      console.log(`Received black-card with ${blackCard}`)
      replaceCard(blackCards, 'black-card', 'card-text-white', [blackCard], false)
    }) 

    socket.on('mode-dealer', () => {
      console.log(`Received mode-dealer`)

      infoDisplay.innerHTML = "Pick the winner (drag the card up as you read them and DOUBLE click the winning card)"
      gameMode = MODE_DEALER
    }) 


    socket.on('mode-player', blackCard => {
      console.log(`Received mode-player with ${blackCard}`)

      infoDisplay.innerHTML = "Pick your best card then press ready"
      startButton = clearAllEventListeners(startButton)
      gameMode = MODE_PLAYER
      replaceCard(blackCards, 'black-card', 'card-text-white', [blackCard], false)  
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
      lastDroppedCardId = null
      allPlayersReady = false
      draggedCard = null
    })

    socket.on('dropped-card', cardtext => {

      if (!dealerCards.includes(cardtext)) {
        sendCards.innerHTML += buildCard(dealerCards.length, "white-card-hand", "card-text-black", cardtext, false)
        dealerCards.push(cardtext)
      }
    })

    // connect button click
    readyButton.addEventListener('click', () => {

      if (gameMode == MODE_CONNECTED) {
        console.log('sending player-ready')
        socket.emit('player-ready')
  
        // Ready button click
        startButton.addEventListener('click', () => {
          if(allPlayersReady) {
            console.log('sending start-game')
            socket.emit('start-game')
  
          } else infoDisplay.innerHTML = "Please wait for players to be ready"
        })

      } else if (gameMode == MODE_PLAYER) {
        if (lastDroppedCardId != null) {
          let cardIndex = lastDroppedCardId.substr(-1)
          console.log(`sending send-cards ${cardIndex}`)
          socket.emit('send-cards', cardIndex)
          sendCards.innerHTML = ''
          whiteCards.innerHTML = buildCard(0, "white-card-hand", "card-text-black", myWhiteCards[parseInt(cardIndex)], false)

        } else {
          infoDisplay.innerHTML = "Pick a card before clicking ready"
        }

      } else if (gameMode == MODE_DEALER) {
        // if (lastDroppedCardId != null) {
        if (dealerCards.length == 1) {
          // let cardIndex = lastDroppedCardId.substr(-1)
          // let cardText = myWhiteCards[parseInt(cardIndex)]
          console.log(`dealer sending send-cards ${dealerCards[0]}`)
          socket.emit('send-cards', dealerCards[0])

        } else {
          infoDisplay.innerHTML = "Pick a single card before clicking ready"
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

  function replaceCard(cardContainer, divClass, textClass, cardText, draggable) {

    //<div class="black-card"><div class="card-text-white"><h4>Best gift for a wife</h4></div></div>
    //<div class="white-card-hand"><div class="card-text-black"><h4>Biggest Blackist Dick</h4></div></div>
    //<div class="white-card-top"><div class="card-text-black"><h4>Biggest Blackist Dick</h4></div></div>
    console.log(`replacing in ${cardContainer.classList} ${cardText.length}`)
    
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
        console.log(`Set dragstart on ${child.id}`)
        if (gameMode == MODE_DEALER) {
          child.addEventListener('dblclick', doubleClick)
          console.log(`Set dblclick on ${child.id}`)
        }
      }
      // counter = 0
      // cardText.forEach(text => {
      //   let id = `${divClass}-${counter}`
      //   let node = document.getElementById(id)
      //   node.addEventListener('dragstart', dragStart)
      //   console.log(`Set dragstart on ${id}`)
      //   counter++
      // })
    }

  }

  function clearAllEventListeners(old_element) {
    var id = old_element.id
    var new_element = old_element.cloneNode(true)
    old_element.parentNode.replaceChild(new_element, old_element)

    return document.getElementById(id)
  }

  function playerInfoUpdate(players) {
    console.log(`in playerConnectedOrDisconnected ${JSON.stringify(players)}`)
    allPlayersReady = true

    let playerString = "Players: "
    let counter = 0
    players.forEach( player => {
      if (counter > 0) playerString += ", "
      playerString += player.name + ":   Wins: " + player.winCount + " (" + player.state +')'
      counter++
      if (player.state == "connected" || player.state == 'disconnected') allPlayersReady = false
    })
    
    if (counter < 2) allPlayersReady = false

    console.log(`recieved ${counter} players all ready: ${allPlayersReady}`)

    playersText.innerHTML = playerString
  }

  function dragStart() {
    draggedCard = this
    console.log(`Drag Start ${draggedCard.id}`)
  }

  function dragOver(e) {
    if (gameMode == MODE_PLAYER || gameMode == MODE_DEALER) e.preventDefault()
  }

  function dragDropSend() {


    if (gameMode == MODE_DEALER) {
      let cardIndex = draggedCard.id.substr(-1)
      let cardText = myWhiteCards[parseInt(cardIndex)]
      sendCards.appendChild(draggedCard)

      gSocket.emit('dropped-card', cardText)

      dealerCards.push(cardText)
console.log(dealerCards)

    } else {
      if (lastDroppedCardId != null && lastDroppedCardId != draggedCard.id) {
        console.log(`Replacing ${draggedCard.id} with ${lastDroppedCardId}`)
        whiteCards.appendChild(document.getElementById(lastDroppedCardId))
  
      }
      sendCards.appendChild(draggedCard);
      lastDroppedCardId = draggedCard.id
  
    }
  }

  function dragDropWhite() {
    console.log(`Removing ${draggedCard.id}`)

    if (gameMode == MODE_DEALER) {
      let cardIndex = draggedCard.id.substr(-1)
      let cardText = myWhiteCards[parseInt(cardIndex)]
      whiteCards.appendChild(draggedCard)

      dealerCards = dealerCards.filter(text => text != cardText)
console.log(dealerCards)
    } else {
      if (lastDroppedCardId != null && lastDroppedCardId == draggedCard.id) {
        whiteCards.appendChild(draggedCard);
        lastDroppedCardId = null  
      }
    }
  }

  function doubleClick() {

    let card = this

    if (gameMode == MODE_DEALER) {
      let cardIndex = card.id.substr(-1)
      let cardText = myWhiteCards[parseInt(cardIndex)]
      console.log(`sending send-cards ${cardText}`)
      gSocket.emit('send-cards', cardText)

    } 
  }

})
