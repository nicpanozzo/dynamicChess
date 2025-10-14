const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*", // Allow all origins for development. Restrict in production.
        methods: ["GET", "POST"]
    }
});

const rooms = {}; // Stores room data: { roomCode: { players: [{ id, username, color, wins, losses }], board: [], winner: null } }

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
            players: [{ id: socket.id, username: data.username, color: 'white', wins: 0, losses: 0 }],
            board: initialBoardState(),
            winner: null // No winner initially
        };
        socket.join(roomCode);
        socket.emit('roomCreated', { roomCode, color: 'white' });
        console.log(`Room ${roomCode} created by ${data.username}`);
    });

    socket.on('joinRoom', (data) => {
        const room = rooms[data.roomCode];
        if (room && room.players.length < 2) {
            room.players.push({ id: socket.id, username: data.username, color: 'black', wins: 0, losses: 0 });
            socket.join(data.roomCode);
            socket.emit('roomJoined', { roomCode: data.roomCode, color: 'black', board: room.board, records: { white: room.players.find(p => p.color === 'white'), black: room.players.find(p => p.color === 'black') } });
            io.to(data.roomCode).emit('playerJoined', { username: data.username, players: room.players, records: { white: room.players.find(p => p.color === 'white'), black: room.players.find(p => p.color === 'black') } });
            console.log(`${data.username} joined room ${data.roomCode}`);
        } else if (room && room.players.length >= 2) {
            socket.emit('joinError', 'Room is full');
        } else {
            socket.emit('joinError', 'Room not found');
        }
    });

    socket.on('makeMove', (data) => {
        const { roomCode, move, playerColor } = data;
        const room = rooms[roomCode];

        console.log(`[Server] makeMove received for room ${roomCode} by ${playerColor}`);

        if (room && !room.winner) { // Only allow moves if game is not over
            const { startRow, startCol, endRow, endCol } = move;
            const pieceToMove = room.board[startRow][startCol];

            // Validate piece ownership
            if ((playerColor === 'white' && pieceToMove === pieceToMove.toLowerCase()) ||
                (playerColor === 'black' && pieceToMove === pieceToMove.toUpperCase())) {
                socket.emit('moveError', 'You can only move your own pieces.');
                console.log(`[Server] Move error: Player ${playerColor} tried to move opponent's piece.`);
                return;
            }

            // Apply the move to the server's board state
            room.board[endRow][endCol] = pieceToMove;
            room.board[startRow][startCol] = '';

            console.log(`[Server] Checking win condition for room ${roomCode}...`);
            const winner = checkWinCondition(room.board);
            console.log(`[Server] Win condition result: ${winner}`);

            if (winner) {
                room.winner = winner;
                const winningPlayer = room.players.find(p => p.color === winner);
                const losingPlayer = room.players.find(p => p.color !== winner);
                if (winningPlayer) winningPlayer.wins++;
                if (losingPlayer) losingPlayer.losses++;

                io.to(roomCode).emit('gameOver', { winner, board: room.board, records: { white: room.players.find(p => p.color === 'white'), black: room.players.find(p => p.color === 'black') } });
                console.log(`[Server] gameOver emitted for room ${roomCode}. Winner: ${winner}`);
            } else {
                io.to(roomCode).emit('moveMade', { move, board: room.board });
                console.log(`[Server] moveMade emitted for room ${roomCode}.`);
            }
        } else if (room && room.winner) {
            console.log(`[Server] Move attempted in room ${roomCode} but game is already over. Winner: ${room.winner}`);
        }
    });

    socket.on('resign', (data) => {
        const { roomCode, playerColor } = data;
        const room = rooms[roomCode];
        if (room && !room.winner) {
            const winnerColor = playerColor === 'white' ? 'black' : 'white';
            room.winner = winnerColor;

            const resigningPlayer = room.players.find(p => p.color === playerColor);
            const winningPlayer = room.players.find(p => p.color === winnerColor);
            if (resigningPlayer) resigningPlayer.losses++;
            if (winningPlayer) winningPlayer.wins++;

            io.to(roomCode).emit('gameOver', { winner: winnerColor, board: room.board, records: { white: room.players.find(p => p.color === 'white'), black: room.players.find(p => p.color === 'black') } });
            console.log(`[Server] Player ${playerColor} resigned in room ${roomCode}. Winner: ${winnerColor}`);
        }
    });

    socket.on('rematchRequest', (data) => {
        const { roomCode, playerColor } = data;
        const room = rooms[roomCode];
        if (room) {
            const opponent = room.players.find(p => p.color !== playerColor);
            console.log(`[Server] Rematch request received from socket ${socket.id} (color: ${playerColor}) in room ${roomCode}`);
            if (opponent) {
                console.log(`[Server] Opponent found: ID ${opponent.id}, color ${opponent.color}. Emitting rematchRequest to opponent.`);
                io.to(opponent.id).emit('rematchRequest');
                console.log(`[Server] Rematch request from ${playerColor} in room ${roomCode} to ${opponent.color}`);
            } else {
                console.log(`[Server] Opponent not found for rematch request in room ${roomCode}.`);
            }
        }
    });

    socket.on('rematchAccept', (data) => {
        const { roomCode, playerColor } = data;
        const room = rooms[roomCode];
        if (room) {
            // Reset game state
            room.board = initialBoardState();
            room.winner = null;

            // Swap colors for rematch
            room.players.forEach(p => {
                p.color = (p.color === 'white' ? 'black' : 'white');
            });

            io.to(roomCode).emit('rematchAccepted', { board: room.board, records: { white: room.players.find(p => p.color === 'white'), black: room.players.find(p => p.color === 'black') } });
            console.log(`[Server] Rematch accepted in room ${roomCode}. New game started.`);
        }
    });

    socket.on('rematchDecline', (data) => {
        const { roomCode, playerColor } = data;
        const room = rooms[roomCode];
        if (room) {
            const opponent = room.players.find(p => p.color !== playerColor);
            if (opponent) {
                io.to(opponent.id).emit('rematchDeclined');
                console.log(`[Server] Rematch declined by ${playerColor} in room ${roomCode}`);
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
                    io.to(roomCode).emit('playerDisconnected', { username: disconnectedPlayer.username });
                    // If a player disconnects, and there's a winner, the game is over for the other player
                    if (!room.winner) {
                        const remainingPlayer = room.players[0];
                        room.winner = remainingPlayer.color;
                        if (remainingPlayer) remainingPlayer.wins++;
                        io.to(roomCode).emit('gameOver', { winner: remainingPlayer.color, board: room.board, records: { white: room.players.find(p => p.color === 'white'), black: room.players.find(p => p.color === 'black') } });
                        console.log(`[Server] gameOver emitted due to disconnect for room ${roomCode}. Winner: ${remainingPlayer.color}`);
                    }
                } else {
                    delete rooms[roomCode];
                    console.log(`[Server] Room ${roomCode} deleted as last player disconnected.`);
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
