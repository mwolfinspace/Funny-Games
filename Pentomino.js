document.addEventListener('DOMContentLoaded', () => {
    // Screens
    const setupScreen = document.getElementById('setup-screen');
    const gameContainer = document.getElementById('game-container');

    // Setup screen elements
    const sizeButtons = document.querySelectorAll('.size-btn');
    const customRowsInput = document.getElementById('custom-rows');
    const customColsInput = document.getElementById('custom-cols');
    const customSizeBtn = document.getElementById('custom-size-btn');

    // Game elements
    const gameBoard = document.getElementById('game-board');
    const targetCountSpan = document.getElementById('target-count');
    const fillBoardBtn = document.getElementById('fill-board-btn');
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    const endGameBtn = document.getElementById('end-game-btn');
    const targetListDiv = document.getElementById('target-list');
    const winMessage = document.getElementById('win-message');

    let boardState = {
        rows: 0,
        cols: 0,
        grid: [], // 2D array representing the board
        targets: [], // Array of {row, col, id}
    };
    let gameWon = false;

    // --- Step 4: Pentomino Definitions ---
    const PENTOMINOES = {
        F: { shape: [[0, 1, 1], [1, 1, 0], [0, 1, 0]], id: 'F' },
        I: { shape: [[1], [1], [1], [1], [1]], id: 'I' },
        L: { shape: [[1, 0], [1, 0], [1, 0], [1, 1]], id: 'L' },
        P: { shape: [[1, 1], [1, 1], [1, 0]], id: 'P' },
        N: { shape: [[0, 1], [0, 1], [1, 1], [1, 0]], id: 'N' },
        T: { shape: [[1, 1, 1], [0, 1, 0], [0, 1, 0]], id: 'T' },
        U: { shape: [[1, 0, 1], [1, 1, 1]], id: 'U' },
        V: { shape: [[1, 0, 0], [1, 0, 0], [1, 1, 1]], id: 'V' },
        W: { shape: [[1, 0, 0], [1, 1, 0], [0, 1, 1]], id: 'W' },
        X: { shape: [[0, 1, 0], [1, 1, 1], [0, 1, 0]], id: 'X' },
        Y: { shape: [[0, 1], [1, 1], [0, 1], [0, 1]], id: 'Y' },
        Z: { shape: [[1, 1, 0], [0, 1, 0], [0, 1, 1]], id: 'Z' }
    };

    function getPieceColor(pieceId) {
        let colors = JSON.parse(localStorage.getItem('pentominoColors')) || {};
        if (!colors[pieceId]) {
            colors[pieceId] = `hsl(${Math.random() * 360}, 70%, 50%)`;
            localStorage.setItem('pentominoColors', JSON.stringify(colors));
        }
        return colors[pieceId];
    }

    Object.keys(PENTOMINOES).forEach(key => {
        PENTOMINOES[key].color = getPieceColor(key);
    });

    // --- Step 5: Fill Board Algorithm ---
    let allPieceOrientations = [];

    fillBoardBtn.addEventListener('click', () => {
        if (boardState.targets.length === 0) {
            alert('Please place some targets on the board first!');
            return;
        }
        // Disable button to prevent re-clicks
        fillBoardBtn.disabled = true;
        fillBoardBtn.textContent = 'Finding solution...';

        // Run solver in a timeout to allow UI to update
        setTimeout(() => {
            findSolution();
            fillBoardBtn.disabled = false;
            fillBoardBtn.textContent = 'Fill the board';
        }, 10);
    });

    function findSolution() {
        const board = boardState.grid.map(row => [...row]);
        const targets = [...boardState.targets];
        allPieceOrientations = generateAllPieceOrientations();
        const availablePieceIds = Object.keys(PENTOMINOES);
        const solutionPieces = [];
        
        // Shuffle piece IDs to try them in a random order
        shuffleArray(availablePieceIds);

        const success = solve(board, targets, availablePieceIds, solutionPieces);
        
        if (success) {
            console.log("Solution found!", solutionPieces);
            boardState.grid = board; // Update main board state
            boardState.placedPieces = solutionPieces;
            drawPieces();
            saveState();
        } else {
            alert('Could not find a valid placement for the given targets. Try moving the targets or using fewer targets.');
        }
    }

    function solve(board, targets, availablePieceIds, placedPieces) {
        if (targets.every(t => board[t.row][t.col] !== 0)) {
            const totalCells = boardState.rows * boardState.cols;
            const filledCells = placedPieces.length * 5;
            // Solvability check: ensure there's enough empty space for at least one piece to move.
            if (totalCells - filledCells >= 5) {
                return true; // SUCCESS
            }
        }

        // Find the first uncovered target to focus on
        const currentTarget = targets.find(t => board[t.row][t.col] === 0);
        if (!currentTarget) {
             // This can happen if all targets are covered but the space check failed.
            return false;
        }

        for (const pieceId of availablePieceIds) {
            const pieceVariations = allPieceOrientations.filter(p => p.id === pieceId);
            shuffleArray(pieceVariations); // Add more randomness

            for (const piece of pieceVariations) {
                // Try to place the piece to cover the currentTarget
                for (let rOffset = 0; rOffset < piece.shape.length; rOffset++) {
                    for (let cOffset = 0; cOffset < piece.shape[0].length; cOffset++) {
                        if (piece.shape[rOffset][cOffset] === 1) {
                            const placeRow = currentTarget.row - rOffset;
                            const placeCol = currentTarget.col - cOffset;

                            if (canPlace(board, piece, placeRow, placeCol)) {
                                // Place piece (mutate board)
                                placePiece(board, piece, placeRow, placeCol);
                                placedPieces.push({ ...piece, row: placeRow, col: placeCol });

                                const newAvailablePieceIds = availablePieceIds.filter(id => id !== pieceId);
                                
                                // Recurse
                                if (solve(board, targets, newAvailablePieceIds, placedPieces)) {
                                    return true; // Found a solution
                                }

                                // Backtrack
                                removePiece(board, piece, placeRow, placeCol); // (mutate board back)
                                placedPieces.pop();
                            }
                        }
                    }
                }
            }
        }

        return false; // No solution found from this path
    }

    function canPlace(board, piece, row, col) {
        for (let r = 0; r < piece.shape.length; r++) {
            for (let c = 0; c < piece.shape[0].length; c++) {
                if (piece.shape[r][c] === 1) {
                    const newRow = row + r;
                    const newCol = col + c;
                    if (newRow < 0 || newRow >= boardState.rows || newCol < 0 || newCol >= boardState.cols || board[newRow][newCol] !== 0) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    function placePiece(board, piece, row, col) {
        for (let r = 0; r < piece.shape.length; r++) {
            for (let c = 0; c < piece.shape[0].length; c++) {
                if (piece.shape[r][c] === 1) {
                    board[row + r][col + c] = piece.id;
                }
            }
        }
    }

    function removePiece(board, piece, row, col) {
         for (let r = 0; r < piece.shape.length; r++) {
            for (let c = 0; c < piece.shape[0].length; c++) {
                if (piece.shape[r][c] === 1) {
                    board[row + r][col + c] = 0;
                }
            }
        }
    }
    
    function drawPieces() {
        const piecesContainer = document.getElementById('pieces-container');
        piecesContainer.innerHTML = '';
        if (!boardState.placedPieces) return;

        boardState.placedPieces.forEach(piece => {
            const pieceDiv = createPieceElement(piece);
            piecesContainer.appendChild(pieceDiv);
        });
    }

    // --- Step 6: Gameplay Logic ---
    let draggedPiece = null;
    let dragOffsetX, dragOffsetY;
    let originalRow, originalCol;

    // Use event delegation on the container for pieces
    document.getElementById('pieces-container').addEventListener('mousedown', (e) => {
        const pieceElement = e.target.closest('.pentomino-piece');
        if (pieceElement) {
            e.preventDefault();
            startDrag(e, pieceElement);
        }
    });

    function startDrag(e, pieceElement) {
        if (draggedPiece || gameWon) return; // Prevent multiple drags or drag after win

        const pieceId = pieceElement.dataset.id;
        const pieceState = boardState.placedPieces.find(p => p.id === pieceId);
        
        // Temporarily remove piece from the grid for collision detection
        removePiece(boardState.grid, pieceState, pieceState.row, pieceState.col);

        draggedPiece = pieceElement;
        originalRow = pieceState.row;
        originalCol = pieceState.col;
        
        const rect = draggedPiece.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;

        draggedPiece.classList.add('dragging');
        
        // Create a shadow piece
        const shadow = createPieceElement(pieceState);
        shadow.classList.add('shadow-piece');
        document.getElementById('pieces-container').appendChild(shadow);

        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', onDrop);
        document.addEventListener('contextmenu', onRotate);
    }
    
    function onDrag(e) {
        if (!draggedPiece) return;
        
        const boardRect = gameBoard.getBoundingClientRect();
        const x = e.clientX - boardRect.left - dragOffsetX;
        const y = e.clientY - boardRect.top - dragOffsetY;

        draggedPiece.style.left = `${x}px`;
        draggedPiece.style.top = `${y}px`;
    }

    function onDrop(e) {
        if (!draggedPiece) return;

        const boardRect = gameBoard.getBoundingClientRect();
        const x = e.clientX - boardRect.left - dragOffsetX;
        const y = e.clientY - boardRect.top - dragOffsetY;

        // Snap to grid
        const newCol = Math.round(x / 30);
        const newRow = Math.round(y / 30);

        const pieceId = draggedPiece.dataset.id;
        const pieceState = boardState.placedPieces.find(p => p.id === pieceId);
        const currentShape = JSON.parse(draggedPiece.dataset.shape);
        const newPieceState = {...pieceState, shape: currentShape};

        // Check if placement is valid
        if (canPlace(boardState.grid, newPieceState, newRow, newCol)) {
            // Valid placement
            pieceState.row = newRow;
            pieceState.col = newCol;
            pieceState.shape = currentShape;

            placePiece(boardState.grid, pieceState, newRow, newCol);
        } else {
            // Invalid placement, return to original position
            soundOhh.play();
            placePiece(boardState.grid, pieceState, originalRow, originalCol);
        }
        
        // Clean up
        draggedPiece.classList.remove('dragging');
        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('mouseup', onDrop);
        document.removeEventListener('contextmenu', onRotate);
        draggedPiece = null;
        
        // Redraw everything to be safe
        drawPieces();
        document.querySelector('.shadow-piece')?.remove();
        
        checkTargets();
        saveState();
    }

    function onRotate(e) {
        e.preventDefault();
        if (!draggedPiece) return;

        const currentShape = JSON.parse(draggedPiece.dataset.shape);
        const rotatedShape = rotateMatrix(currentShape);
        
        // Re-create the element with the new shape
        const pieceId = draggedPiece.dataset.id;
        const pieceColor = getPieceColor(pieceId);
        
        const newPieceDiv = createPieceElement({ id: pieceId, shape: rotatedShape, color: pieceColor });
        newPieceDiv.classList.add('dragging');
        newPieceDiv.style.left = draggedPiece.style.left;
        newPieceDiv.style.top = draggedPiece.style.top;
        
        draggedPiece.replaceWith(newPieceDiv);
        draggedPiece = newPieceDiv;
    }

    function createPieceElement(piece) {
        const pieceDiv = document.createElement('div');
        pieceDiv.classList.add('pentomino-piece');
        pieceDiv.style.position = 'absolute';
        if (piece.col !== undefined && piece.row !== undefined) {
            pieceDiv.style.left = `${piece.col * 30}px`;
            pieceDiv.style.top = `${piece.row * 30}px`;
        }
        pieceDiv.dataset.id = piece.id;
        pieceDiv.dataset.shape = JSON.stringify(piece.shape);
    
        const pieceGrid = document.createElement('div');
        pieceGrid.style.display = 'grid';
        pieceGrid.style.gridTemplateRows = `repeat(${piece.shape.length}, 30px)`;
        pieceGrid.style.gridTemplateColumns = `repeat(${piece.shape[0].length}, 30px)`;
        pieceGrid.style.pointerEvents = 'none'; // So clicks go to the parent
    
        for (let r = 0; r < piece.shape.length; r++) {
            for (let c = 0; c < piece.shape[0].length; c++) {
                const block = document.createElement('div');
                if (piece.shape[r][c] === 1) {
                    block.classList.add('block');
                    block.style.backgroundColor = piece.color;
                }
                pieceGrid.appendChild(block);
            }
        }
        pieceDiv.appendChild(pieceGrid);
        return pieceDiv;
    }

    // --- Step 8: Undo/Redo Logic ---
    let history = [];
    let redoStack = [];

    function saveState() {
        // Simple deep copy for this object structure
        const state = JSON.parse(JSON.stringify(boardState));
        history.push(state);
        redoStack = []; // Clear redo stack on new action
        
        undoBtn.disabled = history.length <= 1;
        redoBtn.disabled = true;
    }
    
    undoBtn.addEventListener('click', () => {
        if (history.length > 1) {
            const currentState = history.pop();
            redoStack.push(currentState);
            
            const prevState = history[history.length - 1];
            boardState = JSON.parse(JSON.stringify(prevState));
            
            restoreState();
        }
    });

    redoBtn.addEventListener('click', () => {
        if (redoStack.length > 0) {
            const nextState = redoStack.pop();
            history.push(nextState);
            
            boardState = JSON.parse(JSON.stringify(nextState));

            restoreState();
        }
    });

    function restoreState() {
        drawPieces();
        renderTargets();
        updateTargetList();
        
        undoBtn.disabled = history.length <= 1;
        redoBtn.disabled = redoStack.length === 0;
    }


    // --- Step 7: Target and Win Condition Logic ---
    const soundYeah = new Audio('kid_yeah.wav');
    const soundOhh = new Audio('Ohh.wav');

    function checkTargets() {
        let newTargetFound = false;
        boardState.targets.forEach(target => {
            if (!target.found && boardState.grid[target.row][target.col] === 0) {
                target.found = true;
                newTargetFound = true;
                soundYeah.play();
            }
        });

        if (newTargetFound) {
            renderTargets();
            updateTargetList();

            // Check for win condition
            if (boardState.targets.every(t => t.found)) {
                handleWin();
            }
        }
    }
    
    function updateTargetList() {
        const remainingTargets = boardState.targets.filter(t => !t.found).length;
        targetCountSpan.textContent = `${remainingTargets} / ${boardState.targets.length}`;
        
        targetListDiv.innerHTML = '<h3>Targets:</h3>';
        const list = document.createElement('ul');
        boardState.targets.forEach(target => {
            const item = document.createElement('li');
            item.textContent = `Target ${target.id}`;
            if (target.found) {
                item.style.textDecoration = 'line-through';
                item.style.color = 'green';
            }
            list.appendChild(item);
        });
        targetListDiv.appendChild(list);
    }

    function handleWin() {
        winMessage.classList.remove('hidden');
        document.getElementById('pieces-container').classList.add('game-won');
        // Disable dragging
        gameWon = true; // A bit of a hack to disable starting new drags
    }

    endGameBtn.addEventListener('click', () => {
         document.getElementById('pieces-container').classList.add('game-won');
         gameWon = true;
    });




    // --- Helper Functions ---
    function generateAllPieceOrientations() {
        const allOrientations = [];
        for (const key in PENTOMINOES) {
            const piece = PENTOMINOES[key];
            let currentShape = piece.shape;
            const uniqueShapes = new Set();

            for (let i = 0; i < 4; i++) {
                // Rotated
                currentShape = rotateMatrix(currentShape);
                let shapeStr = JSON.stringify(currentShape);
                if (!uniqueShapes.has(shapeStr)) {
                    uniqueShapes.add(shapeStr);
                    allOrientations.push({ ...piece, shape: currentShape,
                        color: getPieceColor(key)
                    });
                }
                // Flipped and rotated
                let flipped = flipMatrix(currentShape);
                shapeStr = JSON.stringify(flipped);
                 if (!uniqueShapes.has(shapeStr)) {
                    uniqueShapes.add(shapeStr);
                    allOrientations.push({ ...piece, shape: flipped,
                        color: getPieceColor(key)
                    });
                }
            }
        }
        return allOrientations;
    }

    function rotateMatrix(matrix) {
        const rows = matrix.length;
        const cols = matrix[0].length;
        const newMatrix = Array(cols).fill(0).map(() => Array(rows).fill(0));
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                newMatrix[c][rows - 1 - r] = matrix[r][c];
            }
        }
        return newMatrix;
    }

    function flipMatrix(matrix) {
        const newMatrix = matrix.map(row => row.slice());
        return newMatrix.reverse();
    }
    
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }



    // --- Step 1: Board Setup ---
    sizeButtons.forEach(button => {
        button.addEventListener('click', () => {
            const rows = parseInt(button.dataset.rows, 10);
            const cols = parseInt(button.dataset.cols, 10);
            initializeBoard(rows, cols);
        });
    });

    customSizeBtn.addEventListener('click', () => {
        const rows = parseInt(customRowsInput.value, 10);
        const cols = parseInt(customColsInput.value, 10);
        if (rows > 0 && cols > 0) {
            initializeBoard(rows, cols);
        } else {
            alert('Please enter valid dimensions for rows and columns.');
        }
    });

    function initializeBoard(rows, cols) {
        gameWon = false;
        boardState.rows = rows;
        boardState.cols = cols;
        boardState.grid = Array(rows).fill(null).map(() => Array(cols).fill(0));
        boardState.targets = [];
        boardState.placedPieces = [];

        gameBoard.innerHTML = '';
        gameBoard.style.gridTemplateRows = `repeat(${rows}, 30px)`;
        gameBoard.style.gridTemplateColumns = `repeat(${cols}, 30px)`;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = document.createElement('div');
                cell.classList.add('cell');
                cell.dataset.row = r;
                cell.dataset.col = c;
                gameBoard.appendChild(cell);
            }
        }
        
        document.getElementById('pieces-container').innerHTML = '';
        document.getElementById('pieces-container').classList.remove('game-won');
        winMessage.classList.add('hidden');

        setupScreen.classList.add('hidden');
        gameContainer.classList.remove('hidden');
        
        history = [];
        redoStack = [];
        saveState(); // Save initial empty state

        updateTargetDisplay();
        updateTargetList();

        // Add event listeners for placing targets
        addCellClickListeners();
    }

    // --- Step 2: Placing Target Markers ---
    function addCellClickListeners() {
        gameBoard.addEventListener('click', handleCellLeftClick);
        gameBoard.addEventListener('contextmenu', handleCellRightClick);
    }

    function handleCellLeftClick(e) {
        if (e.target.classList.contains('cell')) {
            const row = parseInt(e.target.dataset.row, 10);
            const col = parseInt(e.target.dataset.col, 10);

            // Add a target if one doesn't already exist
            if (!boardState.targets.some(t => t.row === row && t.col === col)) {
                const newTarget = { row, col, id: boardState.targets.length + 1, found: false };
                boardState.targets.push(newTarget);
                renderTargets();
                updateTargetDisplay();
                saveState();
            }
        }
    }

    function handleCellRightClick(e) {
        e.preventDefault(); // Prevent context menu
        if (e.target.classList.contains('cell')) {
            const row = parseInt(e.target.dataset.row, 10);
            const col = parseInt(e.target.dataset.col, 10);

            // Remove the target if it exists
            const targetIndex = boardState.targets.findIndex(t => t.row === row && t.col === col);
            if (targetIndex > -1) {
                boardState.targets.splice(targetIndex, 1);
                // Re-assign IDs
                boardState.targets.forEach((t, i) => t.id = i + 1);
                renderTargets();
                updateTargetDisplay();
                saveState();
            }
        }
    }

    function renderTargets() {
        // Clear existing circles
        document.querySelectorAll('.target-circle').forEach(circle => circle.remove());

        // Draw all targets from state
        boardState.targets.forEach(target => {
            const cell = gameBoard.querySelector(`.cell[data-row='${target.row}'][data-col='${target.col}']`);
            if (cell) {
                const circle = document.createElement('div');
                circle.classList.add('target-circle');
                if (target.found) {
                    circle.classList.add('found');
                }
                circle.textContent = target.id;
                cell.appendChild(circle);
            }
        });
    }

    function updateTargetDisplay() {
        targetCountSpan.textContent = boardState.targets.length;
        updateTargetList();
    }

});
