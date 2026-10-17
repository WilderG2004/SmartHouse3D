// @name Eventos de sensor (humo, calor, humedad)
// @kind handler
// Comandos: smoke.simulate {active} · heat.simulate {active} · humidity.simulate {active}
// Piden que un sensor produzca una lectura alta para ver las alertas. No encienden ni apagan dispositivos.
const LONG = 10 * 60 * 1000;
if (cmd.kind === 'smoke.simulate') {
  S.smoke.leak = !!cmd.active;
  log(S.smoke.leak ? 'warning' : 'info', cfg.SMOKE.label, S.smoke.leak ? 'Fuga de humo simulada iniciada' : 'Fuga de humo simulada detenida');
} else if (cmd.kind === 'heat.simulate') {
  S.ev.heat = cmd.active ? now + cfg.SENSORS.events.heatKitchen.durationSec * 1000 : 0;
  log(cmd.active ? 'warning' : 'info', 'Sensor de temperatura', cmd.active ? 'Evento de calor en la cocina iniciado' : 'Evento de calor en la cocina detenido');
} else if (cmd.kind === 'humidity.simulate') {
  S.ev.hum = cmd.active ? now + cfg.SENSORS.events.humidityBath.durationSec * 1000 : 0;
  log(cmd.active ? 'warning' : 'info', 'Sensor de humedad', cmd.active ? 'Evento de humedad en el baño iniciado' : 'Evento de humedad en el baño detenido');
} else {
  return null;
}
return done();
