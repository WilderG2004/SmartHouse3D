// @name Expiraciones (PIR y temporizadores)
// @kind expire
// Se ejecuta cada segundo: fin del movimiento (apaga las luces automáticas) y
// apagado automático de enchufes con temporizador.
for (const def of cfg.PIRS) {
  const until = S.pirUntil[def.id];
  if (!S.pirMotion[def.id] || !until || now < until) continue;

  S.pirMotion[def.id] = false;
  S.pirUntil[def.id] = null;
  out.push({ type: 'pir', ts: now, id: def.id, motion: false });

  const offLabels = [];
  for (const lightId of S.pirAuto[def.id] || []) {
    // ¿otro PIR todavía necesita esta luz?
    const held = cfg.PIRS.some((o) => o.id !== def.id && S.pirMotion[o.id] && (S.pirAuto[o.id] || []).includes(lightId));
    if (!held && S.lights[lightId] && S.lights[lightId].on) {
      cmds.push({ kind: 'light.set', id: lightId, patch: { on: false }, auto: true });
      offLabels.push(nameOf(cfg.LIGHTS, lightId));
    }
  }
  S.pirAuto[def.id] = [];
  log('info', def.label, offLabels.length ? 'Sin movimiento · luces apagadas (' + offLabels.join(', ') + ')' : 'Sin movimiento');
}

for (const p of cfg.PLUGS) {
  const st = S.plugs[p.id];
  if (st.on && st.offAt && now >= st.offAt) cmds.push({ kind: 'plug.set', id: p.id, on: false, reason: 'timer' });
}
return done();
