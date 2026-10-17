// @name Reloj simulado
// @kind handler
// @uses world
// Comando: { kind:'world.setHour', hour }   hour:null → vuelve a la hora del equipo
const h = cmd.hour;
S.hourOverride = h === null || h === undefined ? null : clamp(Number(h) || 0, 0, 23.99);
if (S.hourOverride === null) log('info', 'Reloj', 'Hora automática (la del equipo)');
out.push({ type: 'climate', ts: now, rooms: climateRooms(), world: worldNow() });
return done();
