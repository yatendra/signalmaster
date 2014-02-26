/*global console*/
var config = require('getconfig'),
    uuid = require('node-uuid'),
    port = process.env.PORT || config.server.port,
    sockets = require('socket.io').listen(parseInt(port)).sockets,
    rooms = [];

sockets.on('connection', function (client) {
    client.resources = {
        screen: false,
        video: true,
        audio: false,
        name:''
    };
    
    client.on('create', function (name, password, cb) {
        if (arguments.length == 3) {
            cb = (typeof cb == 'function') ? cb : function () {};
            name = name || uuid();
            password = password || "";
        } else {
            cb = name;
            name = uuid();
            password="";
        }
        // check if exists
        if (sockets.clients(name).length) {
            safeCb(cb)('taken');
        } else {
            join(name,password);
            safeCb(cb)(null, name);
        }
    });

    client.on('join', function(name,password,cb){
        join(name,password,cb);
    });
    
    // we don't want to pass "leave" directly because the
    // event type string of "socket end" gets passed too.
    client.on('disconnect', function () {
        removeFeed();
    });
    
    client.on('leave', removeFeed);

    // pass a message to another id
    client.on('message', function (details) {
        var otherClient = sockets.sockets[details.to];
        if (!otherClient) return;
        details.from = client.id;
        otherClient.emit('message', details);
    });

    client.on('shareScreen', function () {
        client.resources.screen = true;
    });

    client.on('unshareScreen', function (type) {
        client.resources.screen = false;
        if (client.room) removeFeed('screen');
    });

    client.on('changePassword', function(password){
        getRoomByName(client.room).password=password;
    });   
    
    function removeFeed(type) {
        var room=getRoomByName(client.room);
        var index=getRoomIndexByName(client.room);
        if(room){
            room.count--;
            if(room.count<=0) rooms.splice(index,1);
        }
        sockets.in(client.room).emit('remove', {
            id: client.id,
            type: type
        });
    }

    function join(name, password, cb) {
        var success=false;
        // sanity check
        if (typeof name !== 'string') return;
        var room=getRoomByName(name);
        if(room){
            if(password===room.password){
                success=true;
                room.count++;
            } else{
                safeCb(cb)("Password incorrect", null)
            }
        } else{
            success=true;
            rooms.push({name:name,password:password,count:1});
        }
        if(success){
            // leave any existing rooms
            if (client.room) removeFeed();
            safeCb(cb)(null, describeRoom(name))
            client.join(name);
            client.room = name;
        }
    }

});

function describeRoom(name) {
    var clients = sockets.clients(name);
    var result = {
        clients: {}
    };
    clients.forEach(function (client) {
        result.clients[client.id] = client.resources;
    });
    return result;
}

function safeCb(cb) {
    if (typeof cb === 'function') {
        return cb;
    } else {
        return function () {};
    }
}

function getRoomByName(name){
    for(var i=0;i<rooms.length;i++)
        if(rooms[i].name==name) return rooms[i];
    return null;
}

function getRoomIndexByName(name){
    for(var i=0;i<rooms.length;i++)
        if(rooms[i].name==name) return i;
    return -1;
}

if (config.uid) process.setuid(config.uid);
console.log('signal master is running at: http://localhost:' + config.server.port);
