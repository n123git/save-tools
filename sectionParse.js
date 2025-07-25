// saveDataParser.js

(function (global) { // make an IIFE for no reason
  class Section { // basic section class
    constructor(id, size, pos) {
      this.id = id;
      this.size = size;
      this.pos = pos;
      this.children = [];
    }
    addChild(child) {
      this.children.push(child);
    }
  }

  function parseSavedata(fullBytes, safety = null) {
    let debug = false; // nearly made this global.... whoops
    const ogLog = console.log; // TEMPORARILY hijack console.log because im too lazy to edit the rest of my code (and my dumbah will CERTAINLY miss atleast one statement XD)
    console.log = (...args) => debug ? ogLog(...args) : undefined; // the : undefined is to shut VS Code up!!!!!!!!!!!!!

    if (!(fullBytes instanceof Uint8Array)) { // validation
      throw new TypeError("SaveDataParser: parseSavedata expected Uint8Array, got " + (typeof fullBytes)); // extremely fancy :0
    }
    const USE_SAFETY = !!(safety > 0) // if its not negative or null or 0 then use safety (im learning clean code :0)

    if (fullBytes.length < safety && USE_SAFETY) {
      console.error("Input too short to skip safety??");
      return null;
    }

    const SINGLE_BYTE = 0xFF // used for sub-byte operations
    const DOUBLE_BYTE = 0xFFFF // used for sub-byte operations
    const OPEN_HEADER = 0xFFFE // the opening header? this is kinda really obvious, why are you reading this (jk)
    const CLOSING_HEADER = 0xFEFF // the closing header (inconsistent grammar FTW!!)

   if (USE_SAFETY) { // --- Safety handling -- // (wow nice symmetry which I totally didnt ruin XD)
      if (safety + 4 > fullBytes.length) {
        throw new RangeError(`SaveDataParser: parseSavedata; Safety offset: ${safety} leaves no room for a header (or is invalid) ???`);
      }

      // peek at the header from the safety position
      const safetyView = new DataView(fullBytes.buffer, fullBytes.byteOffset + safety, 4);
      const headerCheck = safetyView.getUint32(0, true);

      if ((headerCheck & DOUBLE_BYTE) !== OPEN_HEADER) {
        throw new SyntaxError(`SaveDataParser: parseSavedata; No valid header found at safety offset ${safety}.`);
      }

      // passed checks -> slice the array starting from the safety
      console.log(`Safety offset ${safety} is acceptable (very posh and fancy - like my code), starting parse from there.`);
   }

    // slice or use whole array
    const bytes = USE_SAFETY ? fullBytes.subarray(safety) : fullBytes; // ternary will ALWAYS be goated

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const stack = []; // overflow? jk
    let root = null;
    let pos = 0;


    function atEnd() { // self-explanatory
      return pos >= bytes.length;
    }

    if (pos + 4 > bytes.length) return null;
    let h1 = view.getUint32(pos, true);
    pos += 4;

    if ((h1 & DOUBLE_BYTE) !== OPEN_HEADER) return null; // if the low 16-bits == 0xFFFE, then continue, also gotta love magic numbers - oh wait I'm releasing this code as a lib, gotta fix them I guess.........

    if (pos + 4 > bytes.length) return null; // no data
    let h2 = view.getUint32(pos, true);
    pos += 4;

    let id = h2 & SINGLE_BYTE; // get the low 8-bits of h2 as id
    let size = h2 >>> 8; // shift right by 8 bits — you get the remaining 24 bits as size

    root = new Section(id, size, pos); // init the new sectionID
    stack.push(root);

    while (!atEnd()) {
      if (pos + 4 > bytes.length) break; // too short/no data left
      h1 = view.getUint32(pos, true);
      pos += 4;

      while ((h1 & DOUBLE_BYTE) === OPEN_HEADER) { // same check as earlier
        if (pos + 4 > bytes.length) return null;

        h2 = view.getUint32(pos, true);
        pos += 4;
        id = h2 & SINGLE_BYTE; // again grab the ID
        size = h2 >>> 8; // and the size

        if (stack.length === 0 || pos + size > bytes.length) return null; // very sad oh noes

        const sec = new Section(id, size, pos); // init a section
        stack[stack.length - 1].addChild(sec); // now we
        stack.push(sec); // add it to stack

        if (pos + 4 > bytes.length) break; // too short/no data left
        h1 = view.getUint32(pos, true);
        pos += 4;
      }

      if ((h1 & DOUBLE_BYTE) === CLOSING_HEADER) { 
        if (stack.length === 0) return console.warn("Extra closing header found, ignoring..."); // global warn even without debug because CMON!
        stack.pop();
      } else { // this spacing looks so weird...
        if (stack.length === 0) {
          console.warn("Data outside sections, stopping parse but exporting tree anyway.");
          break; // Don't return null — just stop parsing.
        }

        const current = stack[stack.length - 1];
        const dataToSkip = Math.max(0, current.size - 4); // yeah not falling for that THIS TIME!!
        if (pos + dataToSkip > bytes.length) return null;
        pos += dataToSkip;
      }
    }

    if (!root) return null;

    // Final check: if the stack is unbalanced, log a warning, but still return the result
    if (stack.length !== 0) {
      console.warn("Unbalanced sections: some sections were not closed properly.");
    }

    console.log = ogLog; // restore before exiting - thank god for synchronous code

    return sectionToObject(root);
  }

  function sectionToObject(section) {
    return {
      id: section.id,
      size: section.size,
      pos: section.pos,
      children: section.children.map(sectionToObject),
    };
  }

  const grabOffset = function(node, targetId) { // having to define grabOffset this way to make it a function is...... interesting - JS is certainly A language
    console.log(`Checking node id: ${node.id}`);
    if (node.id === targetId) {
      console.log(`Found id ${targetId}, pos: ${node.pos}`);
      return node.pos;
    }

    for (const child of node.children) {
      const pos = grabOffset(child, targetId);
      if (pos !== null) {
        return pos;
      }
    }

    return null;
  }

  global.SaveDataParser = {
    parseSavedata, grabOffset
  };

  if (typeof module !== "undefined" && module.exports) { // Automatic module integration for node (still works without it - just a neat feature)
    module.exports = { parseSavedata, grabOffset };
  }
  if (typeof define === "function" && define.amd) { // also for ESM - again, not needed just a cool addon
    define([], () => ({ parseSavedata, grabOffset }));
  }

})(globalThis); // I tried some weird ass `this` shenanigans before realising globalThis actually exists :0
