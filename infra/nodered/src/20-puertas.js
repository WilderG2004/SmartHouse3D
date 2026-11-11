// @name Puertas
// @kind handler
// Comando: { kind:'door.set', id, open, quiet? }
const def = cfg.DOORS.find((d) => d.id === cmd.id);
if (!def || !!S.doors[def.id] === !!cmd.open) return null;

S.doors[def.id] = !!cmd.open;
out.push({ type: 'door', ts: now, id: def.id, open: !!cmd.open });
log('info', def.label, cmd.open ? 'Puerta abierta' : 'Puerta cerrada', cmd.quiet);

// Solo las puertas con sensor (perímetro) pueden disparar la alarma
if (cmd.open && def.sensor) cmds.push({ kind: 'security.trigger', cause: def.label + ' abierta' });

// Con la alarma ARMADA (en casa o fuera), abrir cualquier otra puerta despierta su detector más cercano: queda
// registrado el movimiento y se enciende su luz unos segundos. NO hace sonar la alarma (eso es solo el perímetro),
// y con la alarma desarmada no pasa nada: abrir una puerta por dentro de casa no tiene por qué encender luces.
if (cmd.open && !def.sensor && def.pir && S.security.mode !== 'disarmed') {
  cmds.push({ kind: 'pir.simulate', id: def.pir, silent: true });   // silent: detecta y alumbra, pero no suena
}
return done();
