// Yo-kai Watch save decryption in JS :<>
// Supports v1.0 and v2.0 encrypted saves: yw2 (use head decryption for yw1)
// Requires SJCL to be defined BEFORE this - Already packaged IF you downloaded this from my github (@n123git)

/* Examples: -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------  /*
* async extractAESKey(headerData)  - An async function that accepts an encrypted head.yw (for YW2) and extracts the AES Key.
* DEFAULT_V1_AES_KEY - the AES key (in a string representation of the hex) for V1 save files in Yo-kai Watch 2
* async decryptV1Save(fileData, keyHex, dontTouchThisParam) - An async function that accepts fileData and a key obtained from extractAESKey. Despite it saying v1save - this works for all YW2 Save Files.
* async encryptV1Save(fileData) - despite the name this encrypts any YW2 Save File using advanced encryption where fileData is a Uint8Array containing the game.ywd (ywd = decrypted .yw)
* async fullBaseEncrypt(fileBuffer) - An async function which uses base encryption on the file buffer (A Uint8Array) - this is used for head.yw's (header files) and YW1 Saves.
* async fullBaseDecrypt(fileBuffer) - An async function which uses base decryption on the file buffer (A Uint8Array) - this is used for head.yw's (header files) and YW1 Saves.
*//* ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------  */
// Utilities ---------------------------------------------------------------

window = globalThis; // patch for other contexts
window.report = true // flag

  function uint32ToLEBytes(value) {
  return [
    value & 0xFF,
    (value >> 8) & 0xFF,
    (value >> 16) & 0xFF,
    (value >> 24) & 0xFF
  ];
} // works mostly the same way somehow XD


function testSJCL() {sjcl.codec} // tests if SJCL has been loaded
try {
  testSJCL() // halts further execution if SJCL has NOT been loaded


  window.DEFAULT_V1_AES_KEY = "352b4e4938575671303956374c493577"; // default AES-KEY - this is the BYTE (not string) version of the default key which is used in v1.0 of the game - check my docs for more  info


    // Patch sjcl codec bytes to fix  garbage code :<><>
    sjcl.codec.bytes = {
      toBits: function(bytes) {
        var out = [], i, tmp=0;
        for(i=0; i < bytes.length; i++) {
          tmp = (tmp << 8) | bytes[i];
          if ((i & 3) === 3) {
            out.push(tmp);
            tmp = 0;
          }
        }
        if ((bytes.length & 3) !== 0) {
          out.push(tmp << (8 * (4 - (bytes.length & 3))));
        }
        return out;
      },
      fromBits: function(bits) {
        var bytes = [], i, j;
        for(i=0; i < bits.length; i++) {
          for(j=3; j >= 0; j--) {
            bytes.push((bits[i] >>> (8*j)) & 0xff);
          }
        }
        while (bytes.length > 0 && bytes[bytes.length-1] === 0) {
          bytes.pop();
        }
        return bytes;
      }
    };


/* Little-endian uint32 writer */
function uint32ToLE(val) {
  return new Uint8Array([
    val & 0xFF,
    (val >> 8) & 0xFF,
    (val >> 16) & 0xFF,
    (val >> 24) & 0xFF
  ]);
}

    function aesCcmDecrypt(ciphertext, key, nonce) {
      try {
        window.nonce = nonce
        const keyBits = sjcl.codec.hex.toBits(key);
        const nonceBits = sjcl.codec.bytes.toBits(Array.from(nonce));

        // Extract MAC (first 16 bytes) and ciphertext (rest)
        const mac = Array.from(ciphertext.slice(0, 16));
        const ct = Array.from(ciphertext.slice(16));

        const macBits = sjcl.codec.bytes.toBits(mac);
        const ctBits = sjcl.codec.bytes.toBits(ct);
        const combinedBits = ctBits.concat(macBits);

        const decryptedBits = sjcl.mode.ccm.decrypt(new sjcl.cipher.aes(keyBits), combinedBits, nonceBits, [], 128);
        const decryptedBytes = sjcl.codec.bytes.fromBits(decryptedBits);
        return new Uint8Array(decryptedBytes);
      } catch (error) {
        console.error('AES-CCM decryption error:', error);
        return null;
      }
    }


    function aesCcmEncrypt(plaintext, key, nonce) {
      try {
        const keyBits = sjcl.codec.hex.toBits(key);
        const nonceBits = sjcl.codec.bytes.toBits(Array.from(nonce));

        const plaintextBits = sjcl.codec.bytes.toBits(Array.from(plaintext));

        const encryptedBits = sjcl.mode.ccm.encrypt(
          new sjcl.cipher.aes(keyBits),
          plaintextBits,
          nonceBits,
          [], // associated data (AAD) - empty for now
          128 // tag length in bits (16 bytes)
        );

        // The last 16 bytes of the encrypted data are the MAC
        const encryptedBytes = sjcl.codec.bytes.fromBits(encryptedBits);
        const ciphertext = encryptedBytes.slice(0, encryptedBytes.length - 16);
        const mac = encryptedBytes.slice(encryptedBytes.length - 16);

        // Combine MAC and ciphertext
        const result = new Uint8Array(mac.concat(ciphertext));
        return result;
      } catch (error) {
        console.error('AES-CCM encryption error:', error);
        return null;
      }
  }

/**
 * Compute CRC32 of a Uint8Array
 * @param {Uint8Array} buf
 * @returns {number} 32-bit CRC
 */
function crc32(buf) {
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let v = i;
      for (let j = 0; j < 8; j++) {
        v = (v & 1) ? (0xEDB88320 ^ (v >>> 1)) : (v >>> 1);
      }
      t[i] = v >>> 0;
    }
    return t;
  })());
  let crc = 0xFFFFFFFF;
  for (const b of buf) {
    crc = table[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Xorshift128 PRNG
 */
class Xorshift {
  constructor(seed) {
    this.state = new Uint32Array(4);
    this.initialize(seed >>> 0); // force uint32
  }

  initialize(seed) {
    this.state[0] = 0x6C078966;
    this.state[1] = 0xDD5254A5;
    this.state[2] = 0xB9523B81;
    this.state[3] = 0x03DF95B3;

    if (seed === 0) return;

    const mult = 0x6C078965; // 0x6C078966 - 1

    seed ^= seed >>> 30;
    seed = Math.imul(seed, mult) >>> 0;
    seed = (seed + 1) >>> 0;
    this.state[0] = seed;

    seed ^= seed >>> 30;
    seed = Math.imul(seed, mult) >>> 0;
    seed = (seed + 2) >>> 0;
    this.state[1] = seed;

    seed ^= seed >>> 30;
    seed = Math.imul(seed, mult) >>> 0;
    seed = (seed + 3) >>> 0;
    this.state[2] = seed;

    // state[3] stays as default
  }

  next(divisor = 0) {
    let t = this.state[0] ^ (this.state[0] << 11);
    t >>>= 0;

    this.state[0] = this.state[1];
    this.state[1] = this.state[2];
    this.state[2] = this.state[3];
    this.state[3] = (
      (this.state[3] ^ (this.state[3] >>> 19)) ^
      (t ^ (t >>> 8))
    ) >>> 0;

    return divisor > 0
      ? this.state[3] % divisor
      : this.state[3];
  }
}


/**
 * Proprietary YWCipher (symmetric)
 * @param {number} seed 32-bit seed
 * @param {number} rounds number of table swaps
 */
class YWCipher {
  constructor(seed, rounds) {
    this.primes = [    3,    5,    7,   11,   13,   17,   19,   23,   29,   31,   37,   41,   43,   47,   53,   59,
   61,   67,   71,   73,   79,   83,   89,   97,  101,  103,  107,  109,  113,  127,  131,  137,
  139,  149,  151,  157,  163,  167,  173,  179,  181,  191,  193,  197,  199,  211,  223,  227,
  229,  233,  239,  241,  251,  257,  263,  269,  271,  277,  281,  283,  293,  307,  311,  313,
  317,  331,  337,  347,  349,  353,  359,  367,  373,  379,  383,  389,  397,  401,  409,  419,
  421,  431,  433,  439,  443,  449,  457,  461,  463,  467,  479,  487,  491,  499,  503,  509,
  521,  523,  541,  547,  557,  563,  569,  571,  577,  587,  593,  599,  601,  607,  613,  617,
  619,  631,  641,  643,  647,  653,  659,  661,  673,  677,  683,  691,  701,  709,  719,  727,
  733,  739,  743,  751,  757,  761,  769,  773,  787,  797,  809,  811,  821,  823,  827,  829,
  839,  853,  857,  859,  863,  877,  881,  883,  887,  907,  911,  919,  929,  937,  941,  947,
  953,  967,  971,  977,  983,  991,  997, 1009, 1013, 1019, 1021, 1031, 1033, 1039, 1049, 1051,
 1061, 1063, 1069, 1087, 1091, 1093, 1097, 1103, 1109, 1117, 1123, 1129, 1151, 1153, 1163, 1171,
 1181, 1187, 1193, 1201, 1213, 1217, 1223, 1229, 1231, 1237, 1249, 1259, 1277, 1279, 1283, 1289,
 1291, 1297, 1301, 1303, 1307, 1319, 1321, 1327, 1361, 1367, 1373, 1381, 1399, 1409, 1423, 1427,
 1429, 1433, 1439, 1447, 1451, 1453, 1459, 1471, 1481, 1483, 1487, 1489, 1493, 1499, 1511, 1523,
 1531, 1543, 1549, 1553, 1559, 1567, 1571, 1579, 1583, 1597, 1601, 1607, 1609, 1613, 1619, 1621
    ];
    this.table = new Uint8Array(256);
    for (let i = 0; i < 256; i++) this.table[i] = i;
    
    const rng = new Xorshift(seed);
    for (let i = 0; i < rounds; i++) {
      const r = rng.next(0x10000);
      const i1 = r & 0xFF, i2 = (r >> 8) & 0xFF;
      if (i1 !== i2) {
        // CORRECTED: I made a (minor) mistake - it needs to match the C++ version's behavior exactly lol
        const val1 = this.table[i1];  // Get values at positions i1, i2
        const val2 = this.table[i2];
        // Swap elements at positions val1 and val2
        const temp = this.table[val1];
        this.table[val1] = this.table[val2];
        this.table[val2] = temp;
      }
    }
  }

  /**
   * Encrypt/decrypt (same operation)
   * @param {Uint8Array} data
   * @returns {Uint8Array}
   */
  apply(data) {
    const out = new Uint8Array(data.length);
    let ka = 0, kb;
    for (let idx = 0; idx < data.length; idx++) {
      if ((idx & 0xFF) === 0) {
        ka = this.primes[this.table[(idx & 0xFF00) >>> 8]];
      }
      kb = this.table[(ka * (idx + 1)) & 0xFF];
      out[idx] = data[idx] ^ kb;
    }
    return out;
  }
}

// Main decryption stuff ---------------------------------------------


window.fullBaseDecrypt = async function(fileBuffer) {
      const uint8Array = fileBuffer;
      
      try {
        let decrypted = await basedecryptV1(uint8Array);
        
        // Check if decrypted data has 12-byte footer (with CRC) instead of 8-byte footer
        // Look for the signature FF FE 6D 08 at position -12
        const last12 = Array.from(decrypted.slice(-12)).map(b => b.toString(16).padStart(2, '0')).join(' ');
        console.log('Decrypted last 12 bytes:', last12);
        
        // If we detect 12-byte footer format, trim the CRC32 bytes
        if (decrypted.length > 12 && 
            decrypted[decrypted.length - 12] === 0xFF && 
            decrypted[decrypted.length - 11] === 0xFE &&
            decrypted[decrypted.length - 10] === 0x6D &&
            decrypted[decrypted.length - 9] === 0x08) {
          console.log('Detected 12-byte footer with CRC, trimming 4 CRC bytes');
          // Remove the 4 CRC bytes (positions -8 to -5)
          const trimmed = new Uint8Array(decrypted.length - 4);
          trimmed.set(decrypted.slice(0, -8)); // Copy everything except last 8 bytes
          trimmed.set(decrypted.slice(-4), trimmed.length - 4); // Copy last 4 bytes (YW key)
          decrypted = trimmed;
          console.log('Trimmed to 8-byte footer. New length:', decrypted.length);
          console.log('New last 8 bytes:', Array.from(decrypted.slice(-8)).map(b => b.toString(16).padStart(2, '0')).join(' '));
        } else {
          console.log("PANIC 372-1: EXPECTED SIG-96, DIDNT FIND IT");
          alert("A potential error has occured......")
        }
        return decrypted;
      } catch (err) {
        console.error(err);
        alert('Decryption failed. See console for details.');
      }
    };

    
window.fullBaseEncrypt = async function(fileBuffer) {
  let uint8Array = fileBuffer;

  // Extract YW key from the footer that decryption added
  let ywKey;

  if (uint8Array.length >= 8) {
    const keyOffset = uint8Array.length - 4;

    // Extract last 4 bytes as little-endian YW key
    ywKey = new DataView(uint8Array.buffer, keyOffset).getUint32(0, true);
    console.log('Extracted YW key from decryption footer:', ywKey.toString(16).padStart(8, '0'));

    // Insert 00 00 00 00 before the YW key position
    const newLength = uint8Array.length + 4;
    const modifiedArray = new Uint8Array(newLength);

    // Copy everything up to the keyOffset
    modifiedArray.set(uint8Array.subarray(0, keyOffset), 0);

    // Insert 4 zero bytes
    modifiedArray.set([0, 0, 0, 0], keyOffset);

    // Copy the original YW key bytes into the new array after the zeros
    modifiedArray.set(uint8Array.subarray(keyOffset), keyOffset + 4);

    uint8Array = modifiedArray;
  } else {
    alert('Invalid input: file too short to contain decryption footer.');
    return;
  }

console.log("a69", new DataView(uint8Array.buffer, uint8Array.length - 8).getUint32(0, true).toString(16).padStart(8, '0'))
  try {
    // Encrypt the buffer (which includes the footer from decryption)
    return await baseencryptV1(uint8Array, ywKey);
  } catch (err) {
    console.error(err);
    alert('Encryption failed. See console for details.');
  }
};



/**
 * Decrypt a v1.0 save buffer using YWCipher (symmetric atleast in that decryption == encryption - which is why the method is called "applys")
 * @param {Uint8Array} buf entire save file (YW-encrypted data)
 * @returns {Uint8Array|null} decrypted data, or null if CRC verification fails
 */
basedecryptV1 = function(buf) {
  // Extract CRC and key from last 8 bytes
  const dataSize = buf.length - 8;
  const crcBytes = buf.subarray(dataSize, dataSize + 4);
  const keyBytes = buf.subarray(dataSize + 4, dataSize + 8);
  
  // Read CRC and key as little-endian uint32
  const expectedCrc = new DataView(crcBytes.buffer, crcBytes.byteOffset).getUint32(0, true);
  const ywKey = new DataView(keyBytes.buffer, keyBytes.byteOffset).getUint32(0, true);
  
  // Extract the data portion (without CRC+key)
  const dataOnly = buf.subarray(0, dataSize);
  
  console.log('Input buf length:', buf.length);
  console.log('Data portion length:', dataOnly.length);
  console.log('Expected CRC:', expectedCrc.toString(16));
  console.log('YW Key:', ywKey.toString(16));
  
  // Verify CRC32 of the encrypted data
  const actualCrc = crc32(dataOnly);
  if (actualCrc !== expectedCrc) {
    console.error(`CRC mismatch: expected ${expectedCrc.toString(16)}, got ${actualCrc.toString(16)}`);
    return null;
  }
  
  // Apply YWCipher with 0x1000 (4096) rounds
  const yw = new YWCipher(ywKey, 0x1000);
  const decrypted = yw.apply(dataOnly);
  
  console.log('Decrypted length:', decrypted.length);
  console.log('Should be same as dataOnly length:', dataOnly.length);
  
  // Append the original CRC+key bytes back (for decryption, C++ doesn't recalculate CRC)
  const result = new Uint8Array(decrypted.length + 8);
  result.set(decrypted, 0);
  result.set(buf.subarray(buf.length - 8), decrypted.length);  // Original 8 bytes
  
  console.log('Final result length:', result.length);
  console.log('Last 12 bytes:', Array.from(result.slice(-12)).map(b => b.toString(16).padStart(2, '0')).join(' '));
  
  return result;
}

    window.extractAESKey = async function(input) {

  // Load bytes depending on input type because im too lazy to remember which
  let inputBytes;
  if (input instanceof Uint8Array) {
    inputBytes = input;
  } else if (input instanceof File) {
    inputBytes = new Uint8Array(await input.arrayBuffer());
  } else {
    throw new Error("Input must be File or Uint8Array");
  }

  // processYW
function processYW(inputBytes, isEncrypt = false) {
  if (inputBytes.length < 8) return null;

  const crcStored = readUint32LE(inputBytes, inputBytes.length - 8);
  const key = readUint32LE(inputBytes, inputBytes.length - 4);
  const data = inputBytes.slice(0, inputBytes.length - 8);

  const cipher = new YWCipher(key, 0x1000);
  const processed = cipher.apply(data); // apply = encrypt or decrypt

  let result = new Uint8Array(processed.length + 8);
  result.set(processed, 0);

  const crcToWrite = isEncrypt ? crc32(processed) : crcStored;

  // Write CRC and key in little-endian
  result.set(uint32ToLEBytes(crcToWrite), processed.length);
  result.set(uint32ToLEBytes(key), processed.length + 4);

  return result;
}

function readUint32LE(buf, offset) {
  return (buf[offset]) |
         (buf[offset + 1] << 8) |
         (buf[offset + 2] << 16) |
         (buf[offset + 3] << 24);
}


  // Run processYW to decrypt (incredible, right)
  const decrypted = processYW(inputBytes, false);
  if (!decrypted) {
    throw new Error("Failed to decrypt or CRC mismatch in input");
  }
  if (decrypted.length < 0x10) {
    throw new Error("Decrypted data too short to read seed");
  }

  const seed = readUint32LE(decrypted, 0x0c);

  // Generate AES key using Xorshift seeded by guess? the seed.... wowowowoow :<><>
  const rng = new Xorshift(seed);
  const aesKeyBytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    aesKeyBytes[i] = rng.next(0x100);
  }

  // Return result as an object
  return {
    seed,
    aesKeyHex: Array.from(aesKeyBytes).map(b => b.toString(16).padStart(2, "0")).join("")
  };
}



    window.decryptV1Save = async function(fileData, keyHex, antirecursionFlag = false) { // there has to be a better solution than this, but whatever - also despite this being called v1 it's only v1 when it uses DEFAULT_V1_AES_KEY otherwise it's technically v2 but whatever - this naming scheme is a result of me continuolsy expanding my code also this comment is about to reach a record lets keep going for no reason other than continuing this lololoop ok ill stop
      try {
        showInfo('Starting (t1) save decryption...');

        if (fileData.length < 28) throw new Error('File too small to be a valid yw save');

        const nonce = fileData.slice(0, 12);
        const encryptedData = fileData.slice(16);

        const mac = fileData.slice(12, 16);
        console.log("MAC:", Array.from(mac).map(b => b.toString(16).padStart(2, '0')).join(' '));

        
        showInfo(`Nonce: ${Array.from(nonce).map(b => b.toString(16).padStart(2,'0')).join(' ')}`);
        showInfo(`Encrypted data length: ${encryptedData.length} bytes`);

        showInfo('Performing AES-CCM decryption...');
        const firstDecryption = aesCcmDecrypt(encryptedData, keyHex, nonce);
        if (!firstDecryption) throw new Error('AES-CCM decryption failed');

        showInfo(`First decryption successful, length: ${firstDecryption.length} bytes`);

        if (firstDecryption.length < 8) throw new Error('First decryption result too small');

        // YW-specific decryption follows
        const uint8Array = firstDecryption;
        let decrypted;
        try {
          decrypted = await basedecryptV1(uint8Array);  // decryptV1 is defined in savemanager.js
        } catch (err) {
          throw new Error('YW decryption failed: ' + err.message);
        }


        // Remove the first 4 out of the last 8 bytes
        if (decrypted.length >= 8) {
           const keepStart = decrypted.slice(0, decrypted.length - 8);
           const keepEnd = decrypted.slice(decrypted.length - 4); // last 4 bytes
           decrypted = new Uint8Array([...keepStart, ...keepEnd]);
        } else {
          throw new Error('Decrypted data too small for cleaning THIS SHOULD NEVER HAPPEN IF THIS DOES PLEASE TELL ME (@n123original on discord)');
        }

        // Convert hex key to bytes
        const aesKeyBytes = Uint8Array.from(keyHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

        // Prepend nonce + MAC + aesKeyBytes to the decrypted data (same format as togenyans editor for compatibility)
        const final = new Uint8Array(nonce.length + mac.length + aesKeyBytes.length + decrypted.length);
        final.set(nonce, 0);
        final.set(mac, nonce.length);
        final.set(aesKeyBytes, nonce.length + mac.length);
        final.set(decrypted, nonce.length + mac.length + aesKeyBytes.length);

        return final;
      } catch (error) { 
        if(!antirecursionFlag) {
          try {
          return await decryptV1Save(fileData, DEFAULT_V1_AES_KEY, true) // stop an infintie loop lol - my CPU cannot handle this XD
          } catch(error) {
            console.log("FALLBACK 2 FAILED X67-32")
          }
        }
        console.error('Decryption error:', error);
        throw error;
      }
    }

/**
 * Encrypts an edited Yo-kai Watch v1 save back into a valid game save.
 *
 * @param {Uint8Array} plainData - Full decrypted save data (starting with nonce/MAC/aesKey like decryptV1Save output)
 * @returns {Uint8Array} Fully re-encrypted save ready to write to file
 */
window.encryptV1Save - async function(plainData) {
  z = showInfo;
  showInfo = console.log;
  showInfo('Starting (t1) save encryption...');

  if (plainData.length < 32) throw new Error('Invalid decrypted buffer – too small.');

  // 1️⃣ Extract structure
  const nonce = plainData.slice(0, 12);
  const mac = plainData.slice(12, 16); // (MAC will be recalculated anyway)
  const aesKeyBytes = plainData.slice(16, 32);
  const ywPlainBlock = plainData.slice(32); // everything else

  // Convert AES key bytes → hex string for aesCcmEncrypt
  const keyHex = Array.from(aesKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  // 2️⃣ Extract YW key from the tail (last 4 bytes)
  if (ywPlainBlock.length < 4) throw new Error('YW block too small');
  const ywKey = new DataView(ywPlainBlock.buffer, ywPlainBlock.byteOffset + ywPlainBlock.length - 4).getUint32(0, true);

  // The actual payload for YWCipher (minus the key)
  const ywDataOnly = ywPlainBlock.slice(0, ywPlainBlock.length - 4);

  showInfo(`YW key: ${ywKey.toString(16)}`);
  showInfo(`YW payload length: ${ywDataOnly.length}`);

  // 3️⃣ Encrypt using YWCipher (symmetric)
  const yw = new YWCipher(ywKey, 0x1000);
  const ywEncrypted = yw.apply(ywDataOnly);

  // 4️⃣ Calculate CRC on encrypted block
  const crc = crc32(ywEncrypted);
   showInfo("The CRC is ", crc, "lol")
  // 5️⃣ Build YW block: encrypted data + CRC + key
  const ywFinalBlock = new Uint8Array(ywEncrypted.length + 8);
  ywFinalBlock.set(ywEncrypted, 0);
  ywFinalBlock.set(uint32ToLE(crc), ywEncrypted.length);
  ywFinalBlock.set(uint32ToLE(ywKey), ywEncrypted.length + 4);

  showInfo(`YW block size (post-encrypt): ${ywFinalBlock.length}`);

  // 6️⃣ AES-CCM encrypt the YW block with nonce + AES key
  showInfo('Encrypting with AES-CCM...');
  const encryptedData = await aesCcmEncrypt(ywFinalBlock, keyHex, nonce);
  if (!encryptedData) throw new Error('AES-CCM encryption failed');

  // 7️⃣ Compose final save: nonce + MAC + encryptedData
  // aesCcmEncrypt should return { ciphertext, mac } or ciphertext-with-mac (depends on your impl)
  // ✅ If aesCcmEncrypt appends the MAC at the end of ciphertext:
  const final = new Uint8Array(nonce.length + 4 + encryptedData.length);
  final.set(nonce, 0);
  // MAC is first 4 bytes of encryptedData? or last? (depends on your aesCcmEncrypt)
  // If last 4 bytes are MAC:
  /* const macBytes =  encryptedData.slice(-4); */ const macBytes = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
  final.set(macBytes, nonce.length);
  final.set(encryptedData, nonce.length + 4);

  showInfo('Encryption complete.');
  showInfo = z;
  return final;
}




    async function tryDecrypt(fileData, z) {
      console.log("69a", await extractAESKey(headFileInput?.files?.[0] ?? z))
      console.log("ra445", await encryptV1Save(fileData))
      if (modeSelect.value === 'manual') {
        // Manual mode: use user key or default
        const userKeyRaw = userKeyInput.value.trim();
        let userKey = userKeyRaw.length === 32 ? userKeyRaw.toLowerCase() : null;

        if (forceUserKeyCheckbox.checked) {
          if (!userKey) {
            throw new Error('FORCE_USER_KEY is enabled but user key is invalid or missing');
          }
          showInfo('FORCE_USER_KEY enabled: using user-provided key');
          return await decryptV1Save(fileData, userKey);
        } else {
          try {
            showInfo('Trying default key...');
            return await decryptV1Save(fileData, DEFAULT_V1_AES_KEY);
          } catch (e) {
            if (!userKey) {
              throw new Error('Default key failed and no valid user key provided');
            }
            showInfo('Default key failed, trying user key...');
            return await decryptV1Save(fileData, userKey);
          }
        }
      } else if (modeSelect.value === 'automatic') {
        // Automatic mode: extract key from head.yw
        let headFile = headFileInput?.files?.[0] ?? z;
        if (!headFile) { // this is where the report flag WAS used in previous code, not anymore its now useless ig
          throw new Error('No head.yw file provided');
        }


        showInfo('Reading head.yw file to extract AES key...');

        // Read head file as ArrayBuffer
        const headBuffer = await headFile.arrayBuffer();
        const headData = new Uint8Array(headBuffer);

        let extractedKeyHex;
        try {
          extractedKeyHex = (await extractAESKey(headFile))['aesKeyHex']; // totally didnt forget how await works and had to fix it lol :<<<<<<<<<<<<<<<<<<,
          console.log(extractedKeyHex)
          if (!extractedKeyHex || extractedKeyHex.length !== 32) {
            throw new Error('extractAESKey returned invalid key');
          }
          extractedKeyHex = extractedKeyHex.toLowerCase();
        } catch (e) {
          try {
            return await decryptV1Save(fileData, DEFAULT_V1_AES_KEY)
          } catch (e) {
             throw new Error("NAH-76")
          }
        }

        showInfo(`Extracted AES key: ${extractedKeyHex}`);

        return await decryptV1Save(fileData, extractedKeyHex);
      }
    }

} catch(error) {
  throw new ReferenceError("savemanager: attempted to load utilities but failed due to missing dependency SJCL") // wow fancy totally not hardcoeded XD
}