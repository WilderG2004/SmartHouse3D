// @name Luces
// @kind handler
// Comando: { kind:'light.set', id, patch:{ on?, intensity?, color? }, auto?, quiet? }
//   auto  = lo pidió una automatización (PIR), no una persona
//   quiet = viene de una escena: no llenar el log
const L = S.lights[cmd.id];
if (!L || !cmd.patch) return null;

const patch = {};
if (cmd.patch.on !== undefined) patch.on = !!cmd.patch.on;
if (cmd.patch.intensity !== undefined) patch.intensity = clamp(Math.round(Number(cmd.patch.intensity) || 0), 0, 100);
if (typeof cmd.patch.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(cmd.patch.color)) patch.color = cmd.patch.color;

const prevOn = L.on;
Object.assign(L, patch);

// Si la toca una persona, deja de ser "automática": el PIR ya no la apaga
if (!cmd.auto) for (const p of Object.keys(S.pirAuto)) S.pirAuto[p] = S.pirAuto[p].filter((x) => x !== cmd.id);

out.push({ type: 'light', id: cmd.id, patch });
if (!cmd.auto && patch.on !== undefined && patch.on !== prevOn) {
  log('info', nameOf(cfg.LIGHTS, cmd.id), patch.on ? 'Luz encendida' : 'Luz apagada', cmd.quiet);
}
return done();
