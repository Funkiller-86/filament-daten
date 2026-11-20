// Gegenstück zu handy_sync.py (Format FB1): PBKDF2 -> HMAC-Strom -> HMAC-Prüfsumme. Nur WebCrypto, keine Bibliothek.
const FB = (() => {
  const enc = new TextEncoder();
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function schluessel(passwort, salz, runden) {
    const basis = await crypto.subtle.importKey("raw", enc.encode(passwort), "PBKDF2", false, ["deriveBits"]);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salz, iterations: runden }, basis, 512));
    const hm = k => crypto.subtle.importKey("raw", k, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return { enc: await hm(bits.slice(0, 32)), mac: await hm(bits.slice(32)) };
  }
  const gleich = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; };
  async function entschluesseln(blob, k) {
    if (blob.length < 51 || blob[0] !== 70 || blob[1] !== 66 || blob[2] !== 49) throw new Error("Format");
    const kopf = blob.subarray(0, blob.length - 32), tag = blob.subarray(blob.length - 32);
    const soll = new Uint8Array(await crypto.subtle.sign("HMAC", k.mac, kopf));
    if (!gleich(soll, tag)) throw new Error("Passwort");
    const nonce = kopf.subarray(3, 19), chiffre = kopf.subarray(19), aus = new Uint8Array(chiffre.length);
    const bloecke = Math.ceil(chiffre.length / 32);
    for (let n = 0; n < bloecke; n++) {
      const eingabe = new Uint8Array(20); eingabe.set(nonce); new DataView(eingabe.buffer).setUint32(16, n, false);
      const s = new Uint8Array(await crypto.subtle.sign("HMAC", k.enc, eingabe));
      const von = n * 32, bis = Math.min(von + 32, chiffre.length);
      for (let i = von; i < bis; i++) aus[i] = chiffre[i] ^ s[i - von];
    }
    return aus;
  }
  async function entpacken(bytes) {
    const strom = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
    return JSON.parse(await new Response(strom).text());
  }
  return { b64, schluessel, entschluesseln, entpacken };
})();
