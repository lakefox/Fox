// webpack fox.js bundle.js && minify bundle.js -o fox.min.js
const ioClient = require("socket.io-client");
const SimplePeer = require("simple-peer");
require("babel-polyfill");
// new fox(ROBLOX,RHS,8080,(HOST));
// fox.send(DATA);
// fox.onMessage = (message)=>{};

window.fox = function (lobby, room, onMessage, host) {
  if (!host) {
    host = "https://pnm.lakefox.net";
  } else if (host == "http") {
    host = "http://pnm.lakefox.net";
  }
  console.log("LOBBY: ", lobby);
  console.log("ROOM: ", room);
  // Store your SOCKETID
  var SOCKETID;

  // Store you SOCKETINDEX
  var SOCKETINDEX;

  // Store your connection status
  var CONNECTED = false;

  // Initiate the peer connection vars
  var TO = undefined;
  var FROM = undefined;

  // A place to store all the SOCKETID's
  var CONNECTIONS;

  // Store the last message id
  var MSGID = 0;

  // Create the socket connection to the server
  var socket = ioClient(host);

  // Connection Established
  console.log("CONNECTED: true")

  socket.on("SOCKETID", (sid)=>{
    SOCKETID = sid;
    console.log("SOCKETID: ", SOCKETID);
    // Send the server your conection data
    socket.emit("META", JSON.stringify({
      "LOBBY": lobby,
      "ROOM": room,
    }));
  });

  // Sends array of SOCKETID's that are in the same LOBBY/ROOM
  socket.on("META", (raw)=>{
    console.log("META: ", raw);
    var data = JSON.parse(raw);
    // Add all the existing SOCKETID's to your DB
    // NOTE: This INCLUDES you
    CONNECTIONS = data;
    // Find your index
    SOCKETINDEX = data.indexOf(SOCKETID);
    // Get your the SOCKETID before you (You'll receive from)
    FROMID = data[SOCKETINDEX-1];
    // Get the next SOCKETID (You'll send to)
    TOID = data[SOCKETINDEX+1];
    // Log the connections
    console.log("TOID:",TOID);
    console.log("FROMID:",FROMID);
    // If there's no one around you (!FROM && !TO) then you are the initiator
    // So you just have to wait for someone to join :(
    // If someone has joined or you aren't the last person
    // then you send them your connection data via ADDSOCKET
    // NOTE: Only send TO your data FROM will send you a initiator request
  });

  // Add the new connection to your list
  socket.on("ADDSOCKET", (sid)=>{
    // Check if already exists
    if (CONNECTIONS.indexOf(sid) == -1) {
      // Add it to the list
      CONNECTIONS.push(sid);
      // Redifine TOID just in case
      TOID = CONNECTIONS[SOCKETINDEX+1];
      // See if it's your TO connection if so then connect to it
      if (SOCKETINDEX+1 == CONNECTIONS.indexOf(sid)) {
        console.log("ADDING SOCKET");
        TO = new SimplePeer({initiator: true, trickle: false});
        // Get the signaling data
        TO.on("signal", function (CDATA) {
          var HANDSHAKE = {
            "INITIATOR": true,
            "CDATA": CDATA,
            "TO": TOID,
            "FROM": SOCKETID
          }
          // Send TO your data
          socket.emit("HANDSHAKE", JSON.stringify(HANDSHAKE));
        });
      } else {
        this.addUser(sid);
      }
    }
  });

  // Listen for FROM to HANDSHAKE you
  socket.on("HANDSHAKE", (raw)=>{
    console.log("HANDSHAKE:",raw);
    var data = JSON.parse(raw);
    // Make sure you are the recipent
    if (data.TO == SOCKETID) {
      // Make sure the right person is sending you this
      // And chck if they are the INITIATOR
      // NOTE: INITIATOR should be true
      if (data.FROM == FROMID && data.INITIATOR) {
        console.log("INITIATOR: false");
        console.log("Creating: FROM");
        FROM = new SimplePeer({trickle: false});
        // Set the connection data
        FROM.signal(data.CDATA);
        // Get your connection data
        FROM.on("signal", function (CDATA) {
          console.log("FROM Signal: true");
          var HANDSHAKE = {
            "INITIATOR": false,
            "CDATA": CDATA,
            "TO": FROMID,
            "FROM": SOCKETID
          }
          // Send back your data
          socket.emit("HANDSHAKE", JSON.stringify(HANDSHAKE));
        });
        // Wait for TO to send data to connect
        FROM.on("data", (raw)=>{
          var data = JSON.parse(raw.toString());
          if (data.CONNECTED == true && CONNECTED == false) {
            CONNECTED = true;
          } else {
            // Deal with the recived Data
            receiveData(data, "FROM");
          }
        });
        // If it wasn't the FROM client check if it is the TO client
        // And check if they are the INITIATOR
        // NOTE: INITIATOR should be false
      } else if (data.FROM == TOID && !data.INITIATOR) {
        console.log("INITIATOR: true");
        // Give TO the signaling data
        TO.signal(data.CDATA);
        // Wait for TO to connect
        TO.on("connect", ()=>{
          console.log("CONNECTED: TO");
          // The server is CONNECTED
          CONNECTED = true;
          if (this.addUser) this.addUser(TOID);
          // Send FROM that you are connected
          TO.send(JSON.stringify({"CONNECTED": true}));
        });
        TO.on("data", (raw)=>{
          var data = JSON.parse(raw.toString());
          // Deal with the recived Data
          receiveData(data, "TO");
        });
      }
    }
  });

  socket.on("REMOVE", (raw)=>{
    console.log("REMOVE:", raw);
    var rawindex = CONNECTIONS.indexOf(raw);
    // Delete the old client
    CONNECTIONS = CONNECTIONS.slice(0,rawindex).concat(CONNECTIONS.slice(rawindex+1));
    console.log(CONNECTIONS, rawindex);
    // Find your new index
    SOCKETINDEX = CONNECTIONS.indexOf(SOCKETID);
    // Redefine TOID just in case
    TOID = CONNECTIONS[SOCKETINDEX+1];
    // Also redefine FROMID jsut in case
    FROMID = CONNECTIONS[SOCKETINDEX-1];
    if (this.removeUser) this.removeUser(raw);
    // Log out the new connections
    console.log("TOID:",TOID);
    console.log("FROMID:",FROMID);
    // See if your TO connection was removed if so the connect to new
    if (SOCKETINDEX+1 == rawindex) {
      console.log("CONNECTING TO:",TOID);
      // You aren't connected to anyone right now
      CONNECTED = false;
      TO = new SimplePeer({initiator: true, trickle: false});
      // Get the signaling data
      TO.on("signal", function (CDATA) {
        var HANDSHAKE = {
          "INITIATOR": true,
          "CDATA": CDATA,
          "TO": TOID,
          "FROM": SOCKETID
        }
        // Send TO your data
        socket.emit("HANDSHAKE", JSON.stringify(HANDSHAKE));
      });
    }
  });

  // Send data
  // NOTE: THIS DATA WILL NOT ALWAYS BE JSON
  this.msg = (raw)=>{
    var data = JSON.stringify({"data": raw, "id": Math.random()});
    // Send the data out in both directions
    if (TOID) {
      TO.send(data);
    }
    if (FROMID) {
      FROM.send(data);
    }
  }
  // Receive Data
  function receiveData(data, who) {
    if (data.id != MSGID && data.data) {
      MSGID = data.id;
      var ids = {};
      ids["FROMID"] = FROMID;
      ids["TOID"] = TOID;
      onMessage(data.data, ids[who]);
      if (who == "TO") {
        // Continue to send the data along if client exists
        // If not then that means your on the end so your done
        if (FROMID) {
          FROM.send(JSON.stringify(data));
        }
      } else if (who == "FROM") {
        // Continue to send the data along if client exists
        // If not then that means your on the end so your done
        if (TOID) {
          TO.send(JSON.stringify(data));
        }
      }
    }
  }
};
