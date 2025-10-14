const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Serve static files from the Angular app
../dist/app/browser

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

    socket.on('createRoom', (data) => {
        const roomCode = generateUniqueRoomCode();
        rooms[roomCode] = {
            players: [{ id: socket.id, username: data.username, color: 'white', isReady: false }],
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
        const room = rooms[data.roomCode];
        if (room) {
            room.players.push({ id: socket.id, username: data.username, color: 'spectator', isReady: false });
            socket.join(data.roomCode);
            io.to(data.roomCode).emit('lobbyState', room);
            console.log(`${data.username} joined room ${data.roomCode}`);
        } else {
            socket.emit('joinError', 'Room not found');
        }
    });

    socket.on('joinLobby', (data) => {
        const { roomCode } = data;
        const room = rooms[roomCode];
        if (room) {
            socket.join(roomCode);
            socket.emit('lobbyState', room);
        }
    });

    socket.on('leaveLobby', (data) => {
        const { roomCode } = data;
        const room = rooms[roomCode];
        if (room) {
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                room.players.splice(playerIndex, 1);
                io.to(roomCode).emit('lobbyState', room);
            }
        }
    });

    socket.on('changeTeam', (data) => {
        const { roomCode, team } = data;
        const room = rooms[roomCode];
        if (room) {
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                const teamHasPlayer = room.players.some(p => p.color === team);
                if (team !== 'spectator' && teamHasPlayer) {
                    socket.emit('teamError', `Team ${team} is already taken.`);
                    return;
                }
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

    socket.on('startGame', (data) => {
        const { roomCode } = data;
        const room = rooms[roomCode];
        if (room && room.roomOwnerId === socket.id) {
            const whitePlayer = room.players.find(p => p.color === 'white');
            const blackPlayer = room.players.find(p => p.color === 'black');

            if (!whitePlayer || !blackPlayer) {
                socket.emit('startError', 'Both teams must have a player.');
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
            const pieceToMove = room.board[startRow][startCol];

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
                const winningPlayer = room.players.find(p => p.color === winner);
                const losingPlayer = room.players.find(p => p.color !== winner && p.color !== 'spectator');
                if (winningPlayer) winningPlayer.wins++;
                if (losingPlayer) losingPlayer.losses++;

                io.to(roomCode).emit('gameOver', { winner, board: room.board, players: room.players });
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

            const resigningPlayer = room.players.find(p => p.color === playerColor);
            const winningPlayer = room.players.find(p => p.color === winnerColor);
            if (resigningPlayer) resigningPlayer.losses++;
            if (winningPlayer) winningPlayer.wins++;

            io.to(roomCode).emit('gameOver', { winner: winnerColor, board: room.board, players: room.players });
        }
    });

    socket.on('rematchRequest', (data) => {
        const { roomCode, playerColor } = data;
        const room = rooms[roomCode];
        if (room) {
            const opponent = room.players.find(p => p.color !== playerColor && p.color !== 'spectator');
            if (opponent) {
                io.to(opponent.id).emit('rematchRequest');
            }
        }
    });

    socket.on('rematchAccept', (data) => {
        const { roomCode } = data;
        const room = rooms[roomCode];
        if (room) {
            room.board = initialBoardState();
            room.winner = null;
            room.gameStarted = true;

            const whitePlayer = room.players.find(p => p.color === 'white');
            const blackPlayer = room.players.find(p => p.color === 'black');
            if (whitePlayer) whitePlayer.color = 'black';
            if (blackPlayer) blackPlayer.color = 'white';
            
            room.players.forEach(p => p.isReady = false);

            io.to(roomCode).emit('rematchAccepted', room);
        }
    });

    socket.on('rematchDecline', (data) => {
        const { roomCode, playerColor } = data;
        const room = rooms[roomCode];
        if (room) {
            const opponent = room.players.find(p => p.color !== playerColor && p.color !== 'spectator');
            if (opponent) {
                io.to(opponent.id).emit('rematchDeclined');
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            const playerIndex = room.players.findIndex(player => player.id === socket.id);
            if (playerIndex !== -1) {
                const disconnectedPlayer = room.players.splice(playerIndex, 1)[0];
                if (room.players.length > 0) {
                    if (room.gameStarted && !room.winner) {
                        const remainingPlayer = room.players.find(p => p.color !== 'spectator');
                        if (remainingPlayer) {
                            room.winner = remainingPlayer.color;
                            remainingPlayer.wins++;
                            io.to(roomCode).emit('gameOver', { winner: remainingPlayer.color, board: room.board, players: room.players });
                        }
                    }
                    io.to(roomCode).emit('lobbyState', room);
                    io.to(roomCode).emit('playerDisconnected', { username: disconnectedPlayer.username });
                } else {
                    delete rooms[roomCode];
                    console.log(`Room ${roomCode} deleted as last player disconnected.`);
                }
                break;
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