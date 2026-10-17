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
return done();
