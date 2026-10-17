// @name Detector de movimiento (PIR)
// @kind handler
// Comando: { kind:'pir.simulate', id }
// Enciende las luces vinculadas durante cfg.PIR_HOLD_MS; las apaga el nodo «Expiraciones».
const def = cfg.PIRS.find((p) => p.id === cmd.id);
if (!def) return null;

const was = !!S.pirMotion[def.id];
S.pirMotion[def.id] = true;
S.pirUntil[def.id] = now + cfg.PIR_HOLD_MS;
out.push({ type: 'pir', ts: now, id: def.id, motion: true });
if (!was) log('info', def.label, 'Movimiento detectado');

// Con la casa armada «fuera de casa», cualquier movimiento es una intrusión
if (S.security.mode === 'away') cmds.push({ kind: 'security.trigger', cause: 'Movimiento en ' + def.label });

const auto = S.pirAuto[def.id] || (S.pirAuto[def.id] = []);
for (const lightId of def.lightIds) {
  const l = S.lights[lightId];
  if (l && !l.on && !auto.includes(lightId)) {
    auto.push(lightId);
    cmds.push({ kind: 'light.set', id: lightId, patch: { on: true }, auto: true });
    log('info', def.label, 'Luz «' + nameOf(cfg.LIGHTS, lightId) + '» encendida automáticamente (' + cfg.PIR_HOLD_MS / 1000 + ' s)');
  }
}
return done();
