import { WebSocketServer } from 'ws';
import { v4 } from 'uuid';

const wss = new WebSocketServer({ port: 8080 });
const tickRate = 60;

const WEAPONS = {
    blizard : {
        b : 45,
        rate : 20
    },
    storm : {
        b : 50,
        rate : 10
    },
    cloud : {
        b : 10,
        rate : 30
    },
    no : {
        b : 0,
        rate : 100
    }
}

let sockets = [];
let rooms = {};
const maxLength = 2;
const MapSize = {
    w : 1000,
    h : 500,
    get realW() {
        return this.w + 50;
    },
    get realH() {
        return this.h+ 50;
    }
};
let speed = 1;
let d = 30;
let timer = 0;

const walls_pos = [
    {x : 300, y : 0, w : 40, h : 450},
    {x : MapSize.realW - 350, y : 150, w : 40, h : 450},
    {x : 100, y : 150, w : 230, h : 50},
    {x : 0, y : 330, w : 220, h : 50},
    {x : 700, y : 400, w : 230, h : 50},
    {x : 300, y : 110, w : 230, h : 50},
    {x : 850, y : 250, w : 230, h : 50},
    {x : 450, y : 350, w : 250, h : 50},
    {x : 840, y : 0, w : 50, h : 180},
    {x : 160, y : MapSize.realH - 100, w : 50, h : 300},
];

const items = [
    {x : 973, y : 62, w : 20, h : 20, t : "blizzard"},
    {x : 75, y : 449, w : 20, h : 20, t : "blizzard"},
    {x : 416, y : 53, w : 20, h : 20, t : "storm"},
    {x : 556, y : 446, w : 20, h : 20, t : "storm"},
    {x : 237, y : 58, w : 20, h : 20, t : "cloud"},
    {x : 846, y : 499, w : 20, h : 20, t : "cloud"}
];

wss.on('connection', (socket) => {
    socket.room = null; // 사용자가 접속한 방
    socket.name = "익명"; // 사용자의 닉네임
    socket.id = v4(); // 고유 식별자 (절대 바뀌지 않음)
    sockets.push(socket);   // 사용자를 배열에 추가


    socket.on("close", () => {

        if (socket.room) {
            if (rooms[socket.room]) {
                let room = rooms[socket.room];
                room.users.splice(room.users.indexOf(socket), 1);
                room.userIds.splice(room.userIds.indexOf(socket.id), 1);
                
                if (rooms[socket.room].users.length === 0) {
                    console.log("no one left in the room", socket.room);
                    delete rooms[socket.room];
                }
            }
        }
        sockets.splice(sockets.indexOf(socket), 1);
    });

    socket.on("message", (msg) => {
        SwitchMessage(JSON.parse(msg), socket);
    });
});

function SwitchMessage(msg, socket) {
    switch (msg.type) {
        case "enter_room":
            EnterRoom(msg, socket);
            break;
        case "pos":
            PosUpdate(msg, socket);
            break;
        case "nick":
            if (socket.room) {
                socket.name = msg.payload;
                rooms[socket.room].users[rooms[socket.room].users.indexOf(socket)].name = msg.payload;
                if (!rooms[socket.room].ready.includes(socket.id)) {
                    rooms[socket.room].ready.push(socket.id);
                }
            }
            break;
        case "fire":
            Fire(msg, socket);
            break;
        case "chat":
            Chat(msg, socket)
            break;
        default:
            socket.send(CreateMessage("warn", "핵 쓰지 마셈"));
            break;
    }
}

function EnterRoom(msg, socket) {
    if (!(msg.payload in rooms)) {
        let temp = {name : msg.payload};
        temp.users = [socket];
        temp.chats = [];
        temp.poses = {};
        temp.userIds = [socket.id];
        temp.fires = [];
        temp.hp = {};
        temp.full = false;
        temp.bullets = {};
        temp.guns = {};
        temp.ready = [];
        temp.items = items;

        temp.hp[socket.id] = 100;
        temp.bullets[socket.id] = WEAPONS.no.b;
        temp.guns[socket.id] = "no";

        temp.poses[socket.id] = {x : 50, y : 50};
        rooms[msg.payload] = temp;
        
        socket.room = msg.payload;
    } else {
        
        if (rooms[msg.payload].users.length == maxLength) {
            socket.send(CreateMessage("warn", "방이 꽉찼습니다."));
            return;
        }
        socket.room = msg.payload;
        rooms[socket.room].users.push(socket);
        rooms[socket.room].poses[socket.id] = {
            x :  MapSize.realW - d - 10,
            y : MapSize.realH - d - 10
        };
        rooms[socket.room].userIds.push(socket.id);
        rooms[socket.room].guns[socket.id] = "no"
        rooms[socket.room].hp[socket.id] = 100;
        rooms[socket.room].bullets[socket.id] = WEAPONS.no.b;
    }
}

function PosUpdate(msg, socket) {
    if (socket.room) {
        
        let prevPos = rooms[socket.room].poses[socket.id];
        let x = prevPos.x;
        let y = prevPos.y;
        msg.payload.map((a) => {
            switch (a) {
                case "KeyW":
                    if (prevPos.y - speed > 0 && CanvMove(prevPos, 0, -1 * speed)) y -= speed;
                    break;
                case "KeyS":
                    if (prevPos.y + speed + d < MapSize.realH && CanvMove(prevPos, 0,speed)) y += speed;
                    break;
                case "KeyA":
                    if (prevPos.x - speed  > 0 && CanvMove(prevPos, -speed, 0)) x -= speed;
                    break;
                case "KeyD":
                    if (prevPos.x + speed + d < MapSize.realW && CanvMove(prevPos, speed, 0)) x += speed;
                    break;
                case "KeyQ":
                    if (timer % 50 == 0) {
                        rooms[socket.room].bullets[socket.id] = WEAPONS[rooms[socket.room].guns[socket.id]].b
                    }
                    break;
                case "KeyE":
                    const user = socket.id;
                    let room = rooms[socket.room];
                    let pos = room.poses[user];
                    room.items.map((item, i, o) => {
                        if (checkCollide({...pos,w : d, h : d}, item)) {
                            o.splice(i, 1);
                            room.guns[user] = item.t;
                            console.log((WEAPONS[item.t]))
                            room.bullets[user] = WEAPONS[item.t].b;
                        }
                    });
                default:
                    
                    break;
            }
        })
       
        let newVec = {x, y};
        rooms[socket.room].poses[socket.id] = newVec;
    }
}

function CanvMove(pos, speed_x, speed_y) {
    let nowPos = {x : pos.x + speed_x, y : pos.y + speed_y, w : d, h : d}
    let flag = false;
    walls_pos.map((a) => {
        if (checkCollide(nowPos, a)) {
            flag = true;
        }
    })
    return !flag;
}

function Fire(msg, socket) {
    if (socket.room) {
        let weapon = WEAPONS[rooms[socket.room].guns[socket.id]];
        if (timer % weapon.rate == 0 && rooms[socket.room].bullets[socket.id] > 0) {
            rooms[socket.room].bullets[socket.id]--;
            let {firedId, pos, myPos} = msg.payload;
            rooms[socket.room].fires.push({firedId, pos, time : timer, myPos});
        }
    }
}

function CreateMessage(type, payload) {
    return JSON.stringify({type, payload});
}

setInterval(() => {
    
    Object.keys(rooms).map((a) => {
        
        let room = rooms[a];

        room.fires.map((fire, i, o) => {
            if (timer - fire.time > 1) {
                o.splice(i, 1);
                return;
            }
            room.userIds.map((ddd) => {
                let w = (fire.pos.y + 5 - fire.myPos.y) / (fire.pos.x + 5 - fire.myPos.x);
                let b = fire.myPos.y - w * fire.myPos.x;
                if (ddd !== fire.firedId) {
                    checkIntersection(room.poses[ddd], w, b, () => {
                        console.log("으앙 맞음")
                        
                        room.hp[ddd]--;
                        if (room.hp[ddd] <= 0) {
                            room.users[ddd].send(CreateMessage("warn", "You died!"))
                        }

                    }, fire.myPos, fire.pos);
                }
            });
        });
        
        if (room.ready.length == 2 && !room.full) {
            room.full = true;
            console.log("a")
            room.users.map((f, _ , o) => {
                f.send(CreateMessage("waitEnd",  f.id));
            });
        } else if (room.full) {
            room.users.map((a, _ , o) => {
                let data = CreateMessage("datas",  {poses : room.poses, chats : room.chats, ids : room.userIds, fires : room.fires, hps : room.hp, items : room.items});
                a.send(data);
            });
        }
    });

    timer++;
}, 1000 / tickRate);

function Chat(msg, socket) {
    if (socket.room) {
        rooms[socket.room].chats.push(`${socket.name} : ${msg.payload}`);
    }
}

function checkIntersection(player, m,b, funct, limits, pos) {
    // 직선과 직사각형의 상하좌우 경계
    const lineTop = m * player.x + b;
    const lineBottom = m * (player.x + d) + b;
    const rectTop = player.y;
    const rectBottom = player.y + d;
    
    // 교차하는 경우
    if (pos.y - limits.y > 0) {
        if (!(limits.y <= player.y)) {
            return
        }
    } else {
        if (!(limits.y >= player.y)) {
            return;
        }
    }
    if ((lineTop >= rectTop && lineTop <= rectBottom) || (lineBottom >= rectTop && lineBottom <= rectBottom)) {
        funct();
    }
  
    // 접하는 경우
    const lineLeft = (player.y - b) / m;
    const lineRight = ((player.y + d) - b) / m;
    if ((lineLeft >= player.x && lineLeft <= player.x + d) ||
        (lineRight >= player.x && lineRight <= player.x + d)) {
            funct();
            
    }
  
    // 꼭지점에서 만나는 경우
    const vertexX = player.x;
    const vertexY = player.y;
    if (b === vertexY && m * vertexX + b === vertexY) {
        funct();
    }
  
    // 교차하지 않는 경우
    return;
  }

function checkCollide(a,b) {
    var x축차이1 = a.x - (b.x + b.w)
    var x축차이2 = b.x - (a.x + a.w)
    var y축차이1 = a.y - (b.y + b.h)
    var y축차이2 = b.y - (a.y + a.h)
    if (x축차이1 < 0 && x축차이2 < 0 && y축차이1 < 0 && y축차이2 < 0) {
        return true;    
    } else {
        return false;
    }
}

