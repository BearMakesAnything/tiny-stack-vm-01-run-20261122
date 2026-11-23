import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OP_INFO = new Uint16Array(256);
const def = (i: number, po: number, pu: number, ...cs: number[]) => {
  for (const c of cs) OP_INFO[c] = 256 | i | (po << 3) | (pu << 5);
};
def(0,0,0,0,52); def(1,0,1,1); def(4,0,1,2); def(0,1,0,3,80,81,83); def(0,1,2,4);
def(0,2,2,5); def(0,2,3,6); def(0,3,3,7); def(0,1,1,23,27,64); def(2,0,0,48,51);
def(2,1,0,49,50); def(0,2,0,65); def(0,0,1,82);
for (let o = 16; o <= 34; o++) if (o !== 23 && o !== 27 && o !== 31) def(0,2,1,o);

export function runVM(program: Uint8Array, input: Uint8Array) {
  const n = program.length, D = new Int32Array(256), C = new Int32Array(64), M = new Int32Array(256), out = new Uint8Array(65536);
  let sp = 0, csp = 0, olen = 0, inPos = 0, pc = 0, steps = 0;

  const result = (exit: number) => ({ stdout: out.subarray(0, olen), exit });

  for (;;) {
    if (steps === 1e6) return result(10);
    if (pc < 0 || pc >= n) return result(9);
    const opcode = program[pc], info = OP_INFO[opcode];
    if (!info) return result(5);
    const imm = info & 7, pops = (info >> 3) & 3, pushes = (info >> 5) & 3;
    if (pc + imm >= n) return result(9);
    steps++;
    const next = pc + 1 + imm;
    if (sp < pops) return result(2);
    if (sp - pops + pushes > 256) return result(3);
    pc = next;

    if (opcode >= 16 && opcode <= 34 && opcode !== 23 && opcode !== 27) {
      const b = D[sp - 1], a = D[sp - 2];
      if (opcode >= 19 && opcode <= 22 && b === 0) return result(4);
      let r = 0;
      switch (opcode) {
        case 16: r = a + b | 0; break; case 17: r = a - b | 0; break; case 18: r = Math.imul(a, b); break;
        case 19: r = a === -2147483648 && b === -1 ? a : (a / b) | 0; break; case 20: r = b === -1 ? 0 : (a % b) | 0; break;
        case 21: r = Math.floor((a >>> 0) / (b >>> 0)) | 0; break; case 22: r = ((a >>> 0) % (b >>> 0)) | 0; break;
        case 24: r = a & b; break; case 25: r = a | b; break; case 26: r = a ^ b; break;
        case 28: r = a << (b & 31); break; case 29: r = a >> (b & 31); break; case 30: r = (a >>> (b & 31)) | 0; break;
        case 32: r = +(a === b); break; case 33: r = +(a < b); break; default: r = +((a >>> 0) < (b >>> 0)); break;
      }
      sp -= 2;
      D[sp++] = r;
      continue;
    }

    switch (opcode) {
      case 0: return result(0);
      case 1: D[sp++] = (program[next - 1] << 24) >> 24; break;
      case 2: D[sp++] = program[next - 4] | (program[next - 3] << 8) | (program[next - 2] << 16) | (program[next - 1] << 24); break;
      case 3: sp--; break;
      case 4: D[sp] = D[sp - 1]; sp++; break;
      case 5: { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; break; }
      case 6: D[sp] = D[sp - 2]; sp++; break;
      case 7: { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; }
      case 23: D[sp - 1] = -D[sp - 1] | 0; break;
      case 27: D[sp - 1] = ~D[sp - 1]; break;
      case 48: case 49: case 50:
        if (opcode === 48 || (opcode === 49 ? D[--sp] === 0 : D[--sp] !== 0))
          pc = next + ((program[next - 2] | (program[next - 1] << 8)) << 16 >> 16);
        break;
      case 51: if (csp === 64) return result(7); C[csp++] = next; pc = program[next - 2] | (program[next - 1] << 8); break;
      case 52: if (csp === 0) return result(8); pc = C[--csp]; break;
      case 64: if (D[sp - 1] >>> 0 >= 256) return result(6); D[sp - 1] = M[D[sp - 1]]; break;
      case 65: if (D[sp - 1] >>> 0 >= 256) return result(6); M[D[sp - 1]] = D[sp - 2]; sp -= 2; break;
      case 80: {
        const s = String(D[--sp]);
        if (olen + s.length > 65536) return result(11);
        for (let i = 0; i < s.length; i++) out[olen++] = s.charCodeAt(i);
        break;
      }
      case 81: if (olen + 1 > 65536) return result(11); out[olen++] = D[--sp] & 255; break;
      case 82: D[sp++] = inPos < input.length ? input[inPos++] : -1; break;
      case 83: return result(D[--sp] & 255);
    }
  }
}

const inDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(inDir).sort()) {
  const res = runVM(readFileSync(join(inDir, id, 'program.bin')), readFileSync(join(inDir, id, 'input.bin')));
  const d = join(outDir, id);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'stdout.bin'), res.stdout);
  writeFileSync(join(d, 'exit.txt'), `${res.exit}\n`);
}


