const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname, '../dist/app/browser')));

const io = socketIo(server, {
    cors: {
        origin: "*", // Allow all origins for development. Restrict in production.
        methods: ["GET", "POST"]
    }
});

const rooms = {}; // Stores room data

function generateUniqueRoomCode() {
    let code;
    do {
        code = Math.random().toString(36).substring(2, 7).toUpperCase();
    } while (rooms[code]);
    return code;
}

function initialBoardState() {
    return [
        ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
        ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
        ['', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
        ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
    ];
}

function checkWinCondition(board) {
    let whiteKingExists = false;
    let blackKingExists = false;

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c] === 'K') {
                whiteKingExists = true;
            } else if (board[r][c] === 'k') {
                blackKingExists = true;
            }
        }
    }

    if (!whiteKingExists) {
        return 'black'; // Black wins
    }
    if (!blackKingExists) {
        return 'white'; // White wins
    }
    return null; // No winner yet
}

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('debugState', () => {
        console.log('[DEBUG] Server State Snapshot:');
        console.log(JSON.stringify(rooms, null, 2));
    });

    socket.on('createRoom', (data) => {
        const roomCode = generateUniqueRoomCode();
        rooms[roomCode] = {
            players: [{ id: socket.id, username: data.username, color: 'white', isReady: false, wins: 0, losses: 0 }],
            customCooldowns: data.customCooldowns,
            roomOwnerId: socket.id,
            gameStarted: false,
            board: null,
            winner: null,
            roomCode: roomCode
        };
        socket.join(roomCode);
        console.log(`Room ${roomCode} created by ${data.username}`);
        setTimeout(() => {
            socket.emit('lobbyState', rooms[roomCode]);
        }, 100);
    });

    socket.on('joinRoom', (data) => {
        const { username, roomCode } = data;
        const room = rooms[roomCode];
        if (room) {
            let player = room.players.find(p => p.username === username);
            if (player) {
                // Player is reconnecting, update their socket ID
                player.id = socket.id;
            } else {
                // New player joining
                room.players.push({ id: socket.id, username: username, color: 'spectator', isReady: false, wins: 0, losses: 0 });
            }
            socket.join(roomCode);
            io.to(roomCode).emit('lobbyState', room);
            console.log(`${username} joined room ${roomCode}`);
        } else {
            socket.emit('joinError', 'Room not found');
        }
    });

    socket.on('joinLobby', (data) => {
        const { roomCode, username } = data;
        const room = rooms[roomCode];
        if (room) {
            socket.join(roomCode);
            let player = room.players.find(p => p.username === username);
            if (player) {
                // Player is reconnecting, update their socket ID
                player.id = socket.id;
            }
            // Broadcast to all in room to ensure sync
            io.to(roomCode).emit('lobbyState', room);
        }
    });

    socket.on('joinGame', (data) => {
        const { roomCode } = data;
        if (rooms[roomCode]) {
            socket.join(roomCode);
        }
    });

    socket.on('changeTeam', (data) => {
        const { roomCode, team } = data;
        const room = rooms[roomCode];
        if (room) {
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                player.color = team;
                player.isReady = false;
                io.to(roomCode).emit('lobbyState', room);
            }
        }
    }); 

    socket.on('setReady', (data) => {
        const { roomCode, isReady } = data;
        const room = rooms[roomCode];
        if (room) {
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                player.isReady = isReady;
                io.to(roomCode).emit('lobbyState', room);
            }
        }
    });

    socket.on('updateSettings', (data) => {
        const { roomCode, customCooldowns } = data;
        const room = rooms[roomCode];
        if (room && room.roomOwnerId === socket.id) {
            room.customCooldowns = customCooldowns;
            io.to(roomCode).emit('lobbyState', room);
        }
    });

    socket.on('swapTeams', (data) => {
        const { roomCode } = data;
        const room = rooms[roomCode];
        // Only allow owner to swap teams
        if (room && room.roomOwnerId === socket.id) {
            room.players.forEach(player => {
                if (player.color === 'white') {
                    player.color = 'black';
                } else if (player.color === 'black') {
                    player.color = 'white';
                }
            });
            // After swapping, emit the new state to everyone in the room
            io.to(roomCode).emit('lobbyState', room);
        }
    });

    socket.on('startGame', (data) => {
        const { roomCode } = data;
        const room = rooms[roomCode];
        if (room && room.roomOwnerId === socket.id) {
            const hasWhitePlayer = room.players.some(p => p.color === 'white');
            const hasBlackPlayer = room.players.some(p => p.color === 'black');

            if (!hasWhitePlayer || !hasBlackPlayer) {
                socket.emit('startError', 'Both teams must have at least one player.');
                return;
            }

            const allPlayersReady = room.players
                .filter(p => p.color !== 'spectator')
                .every(p => p.isReady);

            if (!allPlayersReady) {
                socket.emit('startError', 'All players must be ready.');
                return;
            }

            room.gameStarted = true;
            room.board = initialBoardState();
            room.players.forEach(p => {
                p.wins = 0;
                p.losses = 0;
            });
            io.to(roomCode).emit('gameStarted', room);
            console.log(`Game started in room ${roomCode}`);
        }
    });

    socket.on('cancelRoom', (data) => {
        const { roomCode } = data;
        const room = rooms[roomCode];
        if (room && room.roomOwnerId === socket.id) {
            socket.to(roomCode).emit('roomCancelled');
            delete rooms[roomCode];
            console.log(`Room ${roomCode} cancelled by owner.`);
        }
    });

    socket.on('makeMove', (data) => {
        const { roomCode, move, playerColor } = data;
        const room = rooms[roomCode];

        if (room && room.gameStarted && !room.winner) {
            const { startRow, startCol, endRow, endCol } = move;

            // Validate move coordinates
            if (
                !Number.isInteger(startRow) || !Number.isInteger(startCol) ||
                !Number.isInteger(endRow) || !Number.isInteger(endCol) ||
                startRow < 0 || startRow > 7 || startCol < 0 || startCol > 7 ||
                endRow < 0 || endRow > 7 || endCol < 0 || endCol > 7
            ) {
                socket.emit('moveError', 'Invalid move coordinates.');
                return;
            }

            const pieceToMove = room.board[startRow][startCol];

            if (!pieceToMove) {
                // This can happen with race conditions, it's not a critical error.
                return;
            }

            if ((playerColor === 'white' && pieceToMove === pieceToMove.toLowerCase()) ||
                (playerColor === 'black' && pieceToMove === pieceToMove.toUpperCase())) {
                socket.emit('moveError', 'You can only move your own pieces.');
                return;
            }

            room.board[endRow][endCol] = pieceToMove;
            room.board[startRow][startCol] = '';

            const winner = checkWinCondition(room.board);

            if (winner) {
                room.winner = winner;
                room.players.forEach(p => {
                    if (p.color === winner) {
                        p.wins = (p.wins || 0) + 1;
                    } else if (p.color !== 'spectator') {
                        p.losses = (p.losses || 0) + 1;
                    }
                });

                const playersPayload = JSON.parse(JSON.stringify(rooms[roomCode].players));
                io.to(roomCode).emit('gameOver', { winner, board: room.board, players: playersPayload });
            } else {
                io.to(roomCode).emit('moveMade', { move, board: room.board });
            }
        }
    });

    socket.on('resign', (data) => {
        const { roomCode, playerColor } = data;
        const room = rooms[roomCode];
        if (room && room.gameStarted && !room.winner) {
            const winnerColor = playerColor === 'white' ? 'black' : 'white';
            room.winner = winnerColor;

            room.players.forEach(p => {
                if (p.color === winnerColor) {
                    p.wins = (p.wins || 0) + 1;
                } else if (p.color === playerColor) {
                    p.losses = (p.losses || 0) + 1;
                }
            });

            const playersPayload = JSON.parse(JSON.stringify(rooms[roomCode].players));
            io.to(roomCode).emit('gameOver', { winner: winnerColor, board: room.board, players: playersPayload });
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            const player = room.players.find(p => p.id === socket.id);

            if (player) {
                // Mark player as disconnected by clearing their socket ID
                player.id = null;
                player.isReady = false;

                // Check if the game should end due to disconnect
                if (room.gameStarted && !room.winner) {
                    const activePlayers = room.players.filter(p => p.id !== null && p.color !== 'spectator');
                    if (activePlayers.length < 2) {
                        const remainingPlayer = activePlayers[0];
                        if(remainingPlayer) {
                            room.winner = remainingPlayer.color;
                            // Update win/loss for all players
                            room.players.forEach(p => {
                                if (p.color === room.winner) {
                                    p.wins = (p.wins || 0) + 1;
                                } else if (p.color !== 'spectator') {
                                    p.losses = (p.losses || 0) + 1;
                                }
                            });
                            io.to(roomCode).emit('gameOver', { winner: room.winner, board: room.board, players: room.players });
                        }
                    }
                }

                io.to(roomCode).emit('lobbyState', room);
                io.to(roomCode).emit('playerDisconnected', { username: player.username });
                break; // Exit loop once player is found and handled
            }
        }
    });
});

// All remaining requests return the Angular app, so it can handle routing.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/app/browser/index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));