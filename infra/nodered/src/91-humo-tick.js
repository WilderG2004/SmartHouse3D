// @name Sensor de humo (cada 1 s)
// @kind tick
// Simula la lectura del sensor MQ-2/MQ-135 de la cocina: ruido normal ≈ 12 ppm; con fuga sube a ~470–510.
const sm = S.smoke;
const cooking = S.ev.heat > now ? 25 : 0;   // cocinar suelta algo de humo, sin llegar a la alarma
const target = sm.leak ? 470 + Math.random() * 40 : cfg.SMOKE.normalPpm + cooking + (Math.random() - 0.5) * 6;
const k = sm.leak ? 0.4 : 0.25;
sm.ppm += (target - sm.ppm) * k + (Math.random() - 0.5) * 3;
sm.ppm = Math.max(5, sm.ppm);

const was = sm.alarm;
// Histéresis: alarma al superar el umbral; se libera por debajo del 75 %
if (!was && sm.ppm > cfg.SMOKE.alarmThresholdPpm) sm.alarm = true;
if (was && sm.ppm < cfg.SMOKE.alarmThresholdPpm * 0.75) sm.alarm = false;
if (sm.alarm !== was) {
  log(sm.alarm ? 'critical' : 'info', cfg.SMOKE.label,
    sm.alarm ? 'ALARMA: humo ' + Math.round(sm.ppm) + ' ppm (umbral ' + cfg.SMOKE.alarmThresholdPpm + ' ppm)' : 'Alarma de humo normalizada');
}
out.push({ type: 'smoke', ts: now, ppm: Math.round(sm.ppm), alarm: sm.alarm, simulating: sm.leak });
return done();
