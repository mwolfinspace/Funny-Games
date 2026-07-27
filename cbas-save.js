/**
 * CBAS Server Game Save Engine
 * Connects HTML games to the PocketBase backend.
 */

// Initialize PocketBase using the current URL origin to automatically handle 
// local IP, cbas-server.local, or Tailscale remote connections.
const pb = new PocketBase(window.location.origin);

const CBAS_GameEngine = {
    /**
     * Save the exact, uncompressed state of a game.
     * * @param {string} gameKey - Unique identifier for the game (e.g., 'shikaku_01', 'sudoku_expert')
     * @param {object} rawBoardState - The complete 1:1 game data object (no encoding needed)
     */
    async saveGameState(gameKey, rawBoardState) {
        // Halt if accessed by an unauthenticated user
        if (!pb.authStore.isValid) {
            console.warn(`[CBAS Auto-Save] Cancelled save for '${gameKey}': No student logged in.`);
            return false;
        }

        try {
            const studentId = pb.authStore.record.id;
            
            // 1. Check if a save already exists for this specific student and game
            const existingSaves = await pb.collection('game_saves').getFullList({
                filter: `student = "${studentId}" && game_key = "${gameKey}"`
            });

            if (existingSaves.length > 0) {
                // 2a. Update the existing record
                const recordId = existingSaves[0].id;
                await pb.collection('game_saves').update(recordId, {
                    board_state: rawBoardState 
                });
                console.log(`[CBAS Auto-Save] Updated existing save for '${gameKey}'`);
            } else {
                // 2b. Create a brand new record
                await pb.collection('game_saves').create({
                    student: studentId,
                    game_key: gameKey,
                    board_state: rawBoardState 
                });
                console.log(`[CBAS Auto-Save] Created new save for '${gameKey}'`);
            }
            return true;
        } catch (error) {
            console.error(`[CBAS Auto-Save] Error saving '${gameKey}':`, error);
            return false;
        }
    },

    /**
     * Load the saved uncompressed state for a game.
     * * @param {string} gameKey - Unique identifier for the game
     * @returns {object|null} The complete board state, or null if no save exists
     */
    async loadGameState(gameKey) {
        if (!pb.authStore.isValid) {
            console.warn(`[CBAS Auto-Load] Cannot load '${gameKey}': No student logged in.`);
            return null;
        }

        try {
            const studentId = pb.authStore.record.id;
            const saves = await pb.collection('game_saves').getFullList({
                filter: `student = "${studentId}" && game_key = "${gameKey}"`
            });

            if (saves.length > 0) {
                console.log(`[CBAS Auto-Load] Successfully loaded state for '${gameKey}'`);
                return saves[0].board_state;
            }
            
            console.log(`[CBAS Auto-Load] No previous save found for '${gameKey}'`);
            return null;

        } catch (error) {
            console.error(`[CBAS Auto-Load] Error loading '${gameKey}':`, error);
            return null;
        }
    }
};