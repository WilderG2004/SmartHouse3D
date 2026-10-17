// @name Escenas
// @kind handler
// Comando: { kind:'scene.apply', id }
// Una escena NO toca el estado: lanza comandos normales (con quiet:true) por el mismo
// enrutador que usa la interfaz. Así cada dispositivo aplica sus propias reglas.
const sc = cfg.SCENES.find((s) => s.id === cmd.id);
if (!sc) return null;

log('info', 'Escena', '«' + sc.label + '» activada');
const q = true;

if (sc.doorsClose) for (const d of cfg.DOORS) cmds.push({ kind: 'door.set', id: d.id, open: false, quiet: q });

for (const l of cfg.LIGHTS) {
  const c = sc.lights[l.id];
  if (c) cmds.push({ kind: 'light.set', id: l.id, patch: { on: true, intensity: c.intensity, color: c.color || cfg.DEFAULT_LIGHT_COLOR }, quiet: q });
  else if (sc.lightsOthers === 'off') cmds.push({ kind: 'light.set', id: l.id, patch: { on: false }, quiet: q });
}
for (const a of cfg.AIR_CONDITIONERS) {
  const c = sc.ac && sc.ac[a.id];
  if (c) {
    const patch = { on: c.on, mode: 'cool' };
    if (c.setpoint) patch.setpoint = c.setpoint;
    if (c.fan) patch.fan = c.fan;
    cmds.push({ kind: 'ac.set', id: a.id, patch, quiet: q });
  } else if (sc.acOthers === 'off') cmds.push({ kind: 'ac.set', id: a.id, patch: { on: false }, quiet: q });
}
for (const p of cfg.PLUGS) {
  const c = sc.plugs && sc.plugs[p.id];
  if (c !== undefined) cmds.push({ kind: 'plug.set', id: p.id, on: c, quiet: q });
  else if (sc.plugsOthers === 'off') cmds.push({ kind: 'plug.set', id: p.id, on: false, quiet: q });
}
if (sc.security) cmds.push({ kind: 'security.set', mode: sc.security, quiet: q });
return done();
