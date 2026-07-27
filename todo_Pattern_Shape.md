To build a stable, shorter SeedID using a lookup library, the system must move away from absolute coordinates ($x, y, \text{rot}$) and toward **Relative Topology**.

Instead of saying "Shape 2 is at $(100, 200)$," the seed will say "Shape 2 is connected to Shape 1 via Index #42."

### 1. The Structure of the JSON Library

To keep the file size manageable while allowing for 5-shape combinations, the JSON should be structured by **complexity levels**.

```json
{
  "L2_Foundations": {
    "tri_sq_e1_e1": 0,
    "tri_hex_v1_v3": 1
  },
  "L3_Clusters": {
    "hex_tri_tri_1": "base81_code",
    "trap_sq_trap_1": "base81_code"
  },
  "L5_Macros": {
    "flower_pattern": "base81_code"
  }
}

```

### 2. Determining the "Exactly Correct" Number for 2-Shape Connections

In a triangular/30-degree snapping grid, the number of unique connections is much smaller than in free space because of **Symmetry** and **Grid Constraints**.

For the **2-shape connection index** (the foundation of your library):

* **Edge-to-Edge:** Since most shapes have equal side lengths, there is usually only **one** unique way two shapes can meet edge-to-edge for any given pair of sides.
* **Vertex-to-Vertex:** On a 30-degree grid, there are 12 possible rotation slots. However, due to the shape's own symmetry (e.g., a Hexagon looks the same every 60 degrees), many of these slots are identical.

**Estimated Unique Connections:**
For your 6 shapes, there are **21 possible pairs** (including a shape with itself). On a 30-degree grid, after removing duplicates caused by symmetry, you will have approximately **120 to 150 unique 2-shape connection states**.

### 3. The "Breaking Down" Algorithm (Greedy Decomposition)

To convert a user's cluster into the shortest seed, the game should use a **Greedy Graph Search**:

1. **Map the Cluster:** Treat the user's build as a graph where shapes are nodes and connections are edges.
2. **Search for Macros (L5):** Look for the largest matches first. Does any part of the user's build match an "L5_Macro" (5 shapes)?
* *If yes:* Replace those 5 shapes with one Macro Index.


3. **Search for Clusters (L3/L4):** Check the remaining shapes for 3-shape or 4-shape patterns in your library.
4. **Fallback to Foundations (L2):** Any remaining shapes are linked to the group using the 2-shape connection index.

### 4. Why this reduces the SeedID

In your current V6 system, each shape likely requires:

* **Type:** 1 char
* **X/Y:** 2–4 chars
* **Rotation:** 1 char
* **Total:** ~5–6 chars per shape.

With the **Library Index**, a 5-shape cluster can be represented as:

* **Macro Header:** 1 char (Signaling an L5 pattern)
* **Macro Index:** 2 chars (Look up the specific 5-shape arrangement)
* **Anchor Point:** 2 chars (Where this group attaches to the previous group)
* **Total:** 5 chars for **five shapes** (1 char per shape).

### 5. Managing the "3-Shape to 5-Shape" Growth

You do not need to index *every* possible 5-shape combination (which would be millions). Instead, index only the **Canonical Patterns**:

* Patterns that form a larger geometric symmetry (like 6 triangles forming a hexagon).
* Patterns frequently used by the user (the system could "learn" and add these to a local JSON).

### Implementation Strategy for `pattern_ultimate.html`:

1. **Pre-calculate the L2 Index:** Write a small script to iterate through all 6 shapes, snapping them at all 30-degree increments, and saving only the unique resulting `{relative_x, relative_y, relative_rot}` offsets.
2. **Assign IDs:** Give each unique offset a Base81 ID.
3. **Recursive Restore:** When the seed is loaded, the `loadSeed` function reads the Index ID, looks up the offset in your JSON, and places the shape relative to its "parent" shape.

# Planning:

This is a massive step forward for your project. Moving the lookup library outside the HTML is the perfect architectural choice—it will keep your main file lightweight and make it much easier to update your combinations later without touching the core engine.

Before I write the patch note, I need to make one gentle mathematical correction regarding the prime numbers. To ensure the game can perfectly decode a seed without errors, the system must use **prime products (multiplication)**, not prime sums.

If you use addition, you will run into collisions. For example, if Shape A is 2 and Shape B is 5, their sum is 7. But if Shape C is 7, the game won't know if the seed is asking for "Shape A + Shape B" or "Shape C." By using multiplication (e.g., $2 \times 5 = 10$), every combination results in a unique number that can only be factored one way (this is known mathematically as Gödel numbering).

Here is the exact patch note you can hand off to your agent to execute this update:

---

### 🛠️ Patch Note for Agent: SeedID Architecture Overhaul (V8)

**Objective:** Strip out the legacy V7 SeedID system, integrate an external JSON library for shape topologies, and implement a Prime-Factorization-based SeedID generator using the existing Base81 and BIP39 encoding.

#### 1. Code Cleanup (What to Remove & Keep)

* **Remove:** Delete `generateSeedV7` and `loadSeedV7` entirely. Remove any greedy graph search logic that relies on absolute $x, y$ coordinates.
* **Keep:** Do not touch `B81_CHARS`, `toB81`, `fromB81`, `LZString`, `seedToPhrase`, or `phraseToSeed`. These are essential for the final string compression.
* **Keep:** The `fetch("words.json")` infrastructure.

#### 2. External Library Implementation

* **Action:** Create a new async function `loadPatternLibrary()` that mirrors the word dictionary loader.
* **Target:** It must fetch a new file named `library.json` upon window load.
* **State Management:** Store the fetched JSON into a global constant (e.g., `TOPOLOGY_LIB`) so the new SeedID functions can reference it instantaneously.

#### 3. The Prime-Based Seed Logic (V8)

* **Concept:** Shift from absolute coordinates ($x, y, \text{rot}$) to a relative **Topology Array**.
* **Implementation:** * Assign a unique prime number to each of the 6 shapes (e.g., Triangle=2, Square=3, Hexagon=5, etc.).
* Assign prime numbers to the predefined connection states in `library.json` (L2, L3, and L5 combinations).
* To record a cluster of shapes, multiply their prime IDs together. The resulting unique composite number represents that exact structural block.
* Convert that final large number into Base81 using the existing `toB81()` function to keep the seed string incredibly short.



#### 4. JSON Generation Strategy (How to build `library.json`)

* **Do not hand-code the JSON.** It will take too long and is prone to human error.
* **Action:** Write a temporary, standalone script (either a Node.js script or a hidden developer function in the browser).
* **The Script's Job:** 1. Loop through all 21 pairs of the 6 core shapes.
2. Snap them together edge-to-edge and vertex-to-vertex at all 30-degree increments.
3. Filter out visual duplicates caused by geometric symmetry.
4. Assign a unique Prime ID to each surviving unique state.
5. Export the result as `library.json` structured by `L2_Foundations`, `L3_Clusters`, and `L5_Macros`.

---

Would you like me to draft the standalone JavaScript "crawler" function that your agent can use to mathematically generate the `library.json` file?