// @name Seguridad (alarma de intrusión)
// @kind security
// Comandos: security.set {mode} · security.trigger {cause} (interno) · security.simulateIntrusion · security.notice {level,message} (interno: avisos de seguridad del canal)
//   desarmada → nada vigila · en casa → puertas exteriores · fuera → puertas + PIR
const LABEL = { disarmed: 'Desarmada', home: 'Armada · en casa', away: 'Armada · fuera de casa' };

if (cmd.kind === 'security.set') {
  const mode = cmd.mode;
  if (!LABEL[mode]) return null;
  if (mode !== 'disarmed') {
    const open = cfg.DOORS.find((d) => d.sensor && S.doors[d.id]);
    if (open) {
      log('warning', 'Seguridad', 'No se puede armar: ' + open.label + ' está abierta');
      out.push({ type: 'security', state: Object.assign({}, S.security) });
      return done();
    }
  }
  S.security = { mode, alarm: false, cause: null };
  out.push({ type: 'security', state: Object.assign({}, S.security) });
  log(mode === 'disarmed' ? 'info' : 'warning', 'Seguridad', LABEL[mode], cmd.quiet);

} else if (cmd.kind === 'security.trigger') {
  if (S.security.mode === 'disarmed' || S.security.alarm) return null;
  S.security = Object.assign({}, S.security, { alarm: true, cause: String(cmd.cause || 'Intrusión') });
  out.push({ type: 'security', state: Object.assign({}, S.security) });
  log('critical', 'Seguridad', 'ALARMA DE INTRUSIÓN: ' + S.security.cause);

} else if (cmd.kind === 'security.simulateIntrusion') {
  const door = cfg.DOORS.find((d) => d.sensor);
  const pir = cfg.PIRS.find((p) => p.primary) || cfg.PIRS[0];
  log('warning', 'Simulación', 'Intrusión simulada: puerta de entrada y movimiento');
  if (door) cmds.push({ kind: 'door.set', id: door.id, open: true });
  delayed.push({ kind: 'pir.simulate', id: pir.id });   // llega 1.2 s después (nodo delay)
} else if (cmd.kind === 'security.notice') {
  // Solo llega desde dentro (auditoría): el WebSocket no puede enviar este tipo (no está en la política de capacidades)
  log(cmd.level === 'critical' ? 'critical' : 'warning', 'Seguridad IoT', String(cmd.message || '').slice(0, 200));
} else {
  return null;
}
return done();
