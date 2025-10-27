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
const pieceCooldowns = {
    p: 2000,
    n: 6000,
    b: 6000,
    r: 9000,
    q: 0,
    k: 0
};

function processMoveQueues() {
    const now = Date.now();
    for (const roomCode in rooms) {
        const room = rooms[roomCode];
        if (!room.gameStarted || room.winner) continue;

        for (const pieceKey in room.moveQueue) {
            const queue = room.moveQueue[pieceKey];
            if (queue.length === 0) continue;

            const cooldown = room.cooldowns[pieceKey];
            if (!cooldown || now >= cooldown) {
                const move = queue.shift();
                const { startRow, startCol } = getCoordsFromKey(pieceKey);
                const piece = room.board[startRow][startCol];

                if (piece && isValidMove(room.board, startRow, startCol, move.endRow, move.endCol)) {
                    let pieceToMove = room.board[startRow][startCol];
                    if (pieceToMove.toLowerCase() === 'p' && (move.endRow === 0 || move.endRow === 7)) {
                        pieceToMove = (pieceToMove === 'P') ? 'Q' : 'q';
                    }
                    room.board[move.endRow][move.endCol] = pieceToMove;
                    room.board[startRow][startCol] = '';

                    const newPieceKey = `${move.endRow}-${move.endCol}`;
                    room.cooldowns[newPieceKey] = now + (room.customCooldowns[piece.toLowerCase()] || pieceCooldowns[piece.toLowerCase()]);
                    io.to(roomCode).emit('cooldownsUpdated', room.cooldowns);

                    if (queue.length > 0) {
                        room.moveQueue[newPieceKey] = queue;
                    }
                    delete room.moveQueue[pieceKey];

                    const winner = checkWinCondition(room.board);
                    if (winner) {
                        room.winner = winner;
                        io.to(roomCode).emit('gameOver', { winner, board: room.board, players: room.players });
                    } else {
                        io.to(roomCode).emit('moveMade', { move, board: room.board });
                        io.to(roomCode).emit('queueUpdated', room.moveQueue);
                    }
                } else {
                    // Move is invalid, discard it and notify client
                    io.to(roomCode).emit('commandError', `Discarded invalid move for ${pieceKey}.`);
                    io.to(roomCode).emit('queueUpdated', room.moveQueue); // Update queue to reflect discarded move
                }
            }
        }
    }
}

function getCoordsFromKey(key) {
    const [startRow, startCol] = key.split('-').map(Number);
    return { startRow, startCol };
}

function isValidMove(board, startRow, startCol, endRow, endCol) {
    const piece = board[startRow][startCol];
    if (!piece) return false;
    const targetPiece = board[endRow][endCol];

    const movingPieceIsWhite = piece === piece.toUpperCase();
    const movingPieceIsBlack = piece === piece.toLowerCase();

    if (targetPiece) {
        const targetPieceIsWhite = targetPiece === targetPiece.toUpperCase();
        const targetPieceIsBlack = targetPiece === targetPiece.toLowerCase();
        if ((movingPieceIsWhite && targetPieceIsWhite) || (movingPieceIsBlack && targetPieceIsBlack)) {
            return false;
        }
    }

    if (endRow < 0 || endRow > 7 || endCol < 0 || endCol > 7) {
        return false;
    }

    switch (piece.toLowerCase()) {
        case 'p': // Pawn
            const direction = piece === 'p' ? 1 : -1;
            const initialRow = piece === 'p' ? 1 : 6;
            if (startCol === endCol) {
                if (startRow === initialRow && endRow === startRow + 2 * direction && !board[startRow + direction][endCol] && !board[endRow][endCol]) {
                    return true;
                }
                if (endRow === startRow + direction && !board[endRow][endCol]) {
                    return true;
                }
            } else if (Math.abs(startCol - endCol) === 1 && endRow === startRow + direction && targetPiece) {
                return true;
            }
            break;
        case 'r': // Rook
            if (startRow === endRow) {
                const step = endCol > startCol ? 1 : -1;
                for (let col = startCol + step; col !== endCol; col += step) {
                    if (board[startRow][col]) return false;
                }
                return true;
            }
            if (startCol === endCol) {
                const step = endRow > startRow ? 1 : -1;
                for (let row = startRow + step; row !== endRow; row += step) {
                    if (board[row][startCol]) return false;
                }
                return true;
            }
            break;
        case 'n': // Knight
            const dx = Math.abs(startRow - endRow);
            const dy = Math.abs(startCol - endCol);
            return (dx === 2 && dy === 1) || (dx === 1 && dy === 2);
        case 'b': // Bishop
            if (Math.abs(startRow - endRow) === Math.abs(startCol - endCol)) {
                const rowStep = endRow > startRow ? 1 : -1;
                const colStep = endCol > startCol ? 1 : -1;
                let row = startRow + rowStep;
                let col = startCol + colStep;
                while (row !== endRow) {
                    if (board[row][col]) return false;
                    row += rowStep;
                    col += colStep;
                }
                return true;
            }
            break;
        case 'q': // Queen
            if (startRow === endRow || startCol === endCol || Math.abs(startRow - endRow) === Math.abs(startCol - endCol)) {
                const rowStep = startRow === endRow ? 0 : (endRow > startRow ? 1 : -1);
                const colStep = startCol === endCol ? 0 : (endCol > startCol ? 1 : -1);
                let row = startRow + rowStep;
                let col = startCol + colStep;
                while (row !== endRow || col !== endCol) {
                    if (board[row][col]) return false;
                    row += rowStep;
                    col += colStep;
                }
                return true;
            }
            break;
        case 'k': // King
            const dxk = Math.abs(startRow - endRow);
            const dyk = Math.abs(startCol - endCol);
            return dxk <= 1 && dyk <= 1;
    }

    return false;
}

setInterval(processMoveQueues, 100);

function generateUniqueRoomCode() {
    let code;
    do {
        code = Math.random().toString(36).substring(2, 7).toUpperCase();
    } while (rooms[code]);
    return code;
}

function initialBoardState() {
    return [
        ['r', 'n', 'b', 'k', 'q', 'b', 'n', 'r'],
        ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
        ['', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
        ['R', 'N', 'B', 'K', 'Q', 'B', 'N', 'R']
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
            players: [{ id: socket.id, username: data.username, color: 'white', isReady: false, wins: 0, losses: 0 }],
            customCooldowns: data.customCooldowns,
            sharedCooldowns: false, // Initialize sharedCooldowns
            roomOwnerId: socket.id,
            gameStarted: false,
            board: null,
            winner: null,
            roomCode: roomCode,
            moveQueue: {},
            cooldowns: {}
        };
        socket.join(roomCode);
        console.log(`Room ${roomCode} created by ${data.username}`);
        setTimeout(() => {
            socket.emit('lobbyState', rooms[roomCode]);
        }, 100);
    });

    socket.on('enterRoom', (data) => {
        const { username, roomCode } = data;
        const room = rooms[roomCode];
        if (room) {
            socket.join(roomCode);
            let player = room.players.find(p => p.username === username);
            if (player) {
                // Player is reconnecting, update their socket ID
                player.id = socket.id;
            } else {
                // This case would be for a new player joining an existing room, which is the same as the old joinRoom
                room.players.push({ id: socket.id, username: username, color: 'spectator', isReady: false, wins: 0, losses: 0 });
            }
            io.to(roomCode).emit('lobbyState', room);
            console.log(`${username} entered room ${roomCode}`);
        } else {
            socket.emit('joinError', 'Room not found');
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
        const { roomCode, customCooldowns, sharedCooldowns } = data;
        const room = rooms[roomCode];
        if (room && room.roomOwnerId === socket.id) {
            room.customCooldowns = customCooldowns;
            room.sharedCooldowns = sharedCooldowns;
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

    socket.on('setOwner', (data) => {
        const { roomCode, playerId } = data;
        const room = rooms[roomCode];
        if (room && room.roomOwnerId === socket.id) {
            const newOwner = room.players.find(p => p.id === playerId);
            if (newOwner) {
                room.roomOwnerId = newOwner.id;
                io.to(roomCode).emit('lobbyState', room);
            }
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
            room.winner = null; // Reset winner for the new game
            room.players.forEach(p => {
                p.isReady = false; // Reset readiness
                p.wins = 0;
                p.losses = 0;
            });
            io.to(roomCode).emit('gameStarted', room);
            console.log(`Game started in room ${roomCode}`);
        }
    });

    socket.on('startNewMatch', (data) => {
        const { roomCode } = data;
        const room = rooms[roomCode];
        if (room && room.roomOwnerId === socket.id) {
            room.gameStarted = true;
            room.board = initialBoardState();
            room.winner = null;
            room.players.forEach(p => p.isReady = false); // Reset readiness
            io.to(roomCode).emit('gameStarted', room);
            console.log(`New match started in room ${roomCode}`);
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
            const pieceKey = `${startRow}-${startCol}`;
            const piece = room.board[startRow][startCol];

            if (!piece) return;

            if ((playerColor === 'white' && piece === piece.toLowerCase()) ||
                (playerColor === 'black' && piece === piece.toUpperCase())) {
                socket.emit('moveError', 'You can only move your own pieces.');
                return;
            }

            const now = Date.now();
            const cooldown = room.cooldowns[pieceKey];

            if (cooldown && now < cooldown) {
                if (!room.moveQueue[pieceKey]) {
                    room.moveQueue[pieceKey] = [];
                }
                room.moveQueue[pieceKey].push(move);
                io.to(roomCode).emit('queueUpdated', room.moveQueue);
            } else {
                if (isValidMove(room.board, startRow, startCol, endRow, endCol)) {
                    let pieceToMove = room.board[startRow][startCol];
                    if (pieceToMove.toLowerCase() === 'p' && (endRow === 0 || endRow === 7)) {
                        pieceToMove = (pieceToMove === 'P') ? 'Q' : 'q';
                    }
                    room.board[endRow][endCol] = pieceToMove;
                    room.board[startRow][startCol] = '';

                    const newPieceKey = `${endRow}-${endCol}`;
                    const pieceType = piece.toLowerCase();
                    const cooldownDuration = room.customCooldowns[pieceType] || pieceCooldowns[pieceType];
                    if (cooldownDuration > 0) {
                        room.cooldowns[newPieceKey] = now + cooldownDuration;
                        io.to(roomCode).emit('cooldownsUpdated', room.cooldowns);
                    }

                    const winner = checkWinCondition(room.board);
                    if (winner) {
                        room.winner = winner;
                        io.to(roomCode).emit('gameOver', { winner, board: room.board, players: room.players });
                    } else {
                        io.to(roomCode).emit('moveMade', { move, board: room.board });
                    }
                } else {
                    socket.emit('moveError', 'Invalid move.');
                }
            }
        }
    });

    socket.on('reorderQueue', (data) => {
        const { roomCode, pieceKey, previousIndex, currentIndex } = data;
        const room = rooms[roomCode];
        if (room && room.moveQueue[pieceKey]) {
            const queue = room.moveQueue[pieceKey];
            const [movedItem] = queue.splice(previousIndex, 1);
            queue.splice(currentIndex, 0, movedItem);
            io.to(roomCode).emit('queueUpdated', room.moveQueue);
        }
    });

    socket.on('cancelFromQueue', (data) => {
        const { roomCode, pieceKey, moveIndex } = data;
        const room = rooms[roomCode];
        if (room && room.moveQueue[pieceKey]) {
            room.moveQueue[pieceKey].splice(moveIndex, 1);
            if (room.moveQueue[pieceKey].length === 0) {
                delete room.moveQueue[pieceKey];
            }
            io.to(roomCode).emit('queueUpdated', room.moveQueue);
        }
    });

    socket.on('executeCommand', (data) => {
        const { roomCode, command } = data;
        const room = rooms[roomCode];
        if (room && room.gameStarted && !room.winner) {
            parseAndExecuteCommand(room, command, socket);
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);

            if (playerIndex !== -1) {
                const player = room.players[playerIndex];
                console.log(`${player.username} disconnected from room ${roomCode}`);

                // If the disconnected player was the owner, transfer ownership
                if (room.roomOwnerId === socket.id) {
                    room.players.splice(playerIndex, 1);
                    if (room.players.length > 0) {
                        const newOwner = room.players[0];
                        room.roomOwnerId = newOwner.id;
                        console.log(`Ownership transferred to ${newOwner.username}`);
                    } else {
                        delete rooms[roomCode];
                        console.log(`Room ${roomCode} is empty and has been deleted.`);
                        return;
                    }
                } else {
                    room.players.splice(playerIndex, 1);
                }

                if (room.gameStarted && !room.winner) {
                    const activePlayers = room.players.filter(p => p.color !== 'spectator');
                    if (activePlayers.length < 2) {
                        const remainingPlayer = activePlayers[0];
                        if (remainingPlayer) {
                            room.winner = remainingPlayer.color;
                            io.to(roomCode).emit('gameOver', { winner: room.winner, board: room.board, players: room.players });
                        }
                    }
                }

                io.to(roomCode).emit('lobbyState', room);
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

function parseAndExecuteCommand(room, command, socket) {

    const [filterStr, actionStr] = command.split('->');

    if (!filterStr || !actionStr) {

        socket.emit('commandError', 'Invalid command format. Use filter->action.');

        return;

    }



    const filter = filterStr.trim();

    let action = actionStr.trim();

    let appendToQueue = false;



    if (action.startsWith('&')) {

        appendToQueue = true;

        action = action.substring(1).trim(); // Remove '&'

    }



    const targetCoords = parseSquare(action);

    if (!targetCoords) {

        socket.emit('commandError', 'Invalid target square.');

        return;

    }

    const { endRow, endCol } = targetCoords;



            const pieces = findPieces(room.board, filter, socket.id, room.players);



            let commandExecuted = false;



            let commandQueued = false;



            let commandFailedDueToCooldown = false;



            let commandFailedDueToInvalidMove = false; // New flag



        



            for (const piece of pieces) {



                const { row: startRow, col: startCol } = piece;



                const pieceKey = `${startRow}-${startCol}`;



                const now = Date.now();



                const cooldown = room.cooldowns[pieceKey];



        



                const isCoolingDown = cooldown && now < cooldown;



        



                // Check move validity only if not appending to queue



                const moveIsValid = isValidMove(room.board, startRow, startCol, endRow, endCol);



        



                if (isCoolingDown) {



                    if (appendToQueue) {



                        // Add to queue even if invalid



                        if (!room.moveQueue[pieceKey]) {



                            room.moveQueue[pieceKey] = [];



                        }



                        room.moveQueue[pieceKey].push({ startRow, startCol, endRow, endCol });



                        commandQueued = true;



                    } else {



                        commandFailedDueToCooldown = true;



                    }



                } else { // No cooldown, or cooldown expired



                    if (moveIsValid) {



                        // Execute move directly



                        let pieceToMove = room.board[startRow][startCol];



                        if (pieceToMove.toLowerCase() === 'p' && (endRow === 0 || endRow === 7)) {



                            pieceToMove = (pieceToMove === 'P') ? 'Q' : 'q';



                        }



                        room.board[endRow][endCol] = pieceToMove;



                        room.board[startRow][startCol] = '';



        



                        const newPieceKey = `${endRow}-${endCol}`;



                        const cooldownDuration = room.customCooldowns[piece.piece.toLowerCase()] || pieceCooldowns[piece.piece.toLowerCase()];



                        if (cooldownDuration > 0) {



                            room.cooldowns[newPieceKey] = now + cooldownDuration;



                            io.to(room.roomCode).emit('cooldownsUpdated', room.cooldowns);



                        }



        



                        io.to(room.roomCode).emit('moveMade', { move: { startRow, startCol, endRow, endCol }, board: room.board });



                        commandExecuted = true;



                    } else {



                        commandFailedDueToInvalidMove = true;



                    }



                }



            }



        



            // Emit feedback after the loop



            if (commandExecuted) {



                socket.emit('commandSuccess', 'Command executed successfully.');



            } else if (commandQueued) {



                socket.emit('commandSuccess', 'Moves added to queue (some may be invalid).');



                io.to(room.roomCode).emit('queueUpdated', room.moveQueue);



            } else if (commandFailedDueToCooldown) {



                socket.emit('commandError', 'Some pieces are on cooldown. Use & to append to queue.');



            } else if (commandFailedDueToInvalidMove) {



                socket.emit('commandError', 'No valid move found for the given command (some moves were invalid).');



            } else {



                socket.emit('commandError', 'No pieces found matching the filter or no valid moves.');



            }

}

function parseSquare(square) {
    if (square.length !== 2) return null;
    const file = square[0].toLowerCase();
    const rank = parseInt(square[1], 10);
    if (file < 'a' || file > 'h' || rank < 1 || rank > 8) return null;

    const endCol = file.charCodeAt(0) - 'a'.charCodeAt(0);
    const endRow = 8 - rank;
    return { endRow, endCol };
}

function findPieces(board, filter, playerId, players) {
    const player = players.find(p => p.id === playerId);
    if (!player) return [];

    const pieces = [];
    const isRankFilter = /^[1-8]$/.test(filter);
    const rankToFilter = isRankFilter ? 8 - parseInt(filter, 10) : -1;

    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            const piece = board[i][j];
            if (!piece) continue;

            const isWhitePiece = piece === piece.toUpperCase();
            const isPlayerPiece = (player.color === 'white' && isWhitePiece) || (player.color === 'black' && !isWhitePiece);

            if (isPlayerPiece) {
                if (isRankFilter) {
                    if (i === rankToFilter) {
                        pieces.push({ row: i, col: j, piece });
                    }
                } else { // piece type filter
                    if (piece.toLowerCase() === filter) {
                        pieces.push({ row: i, col: j, piece });
                    }
                }
            }
        }
    }
    return pieces;
}