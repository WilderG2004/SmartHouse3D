// @name Clima y termostato A/C (cada 1 s)
// @kind tick
// @uses world
// Modelo térmico por habitación:
//   temperatura → tiende al exterior (menos aislamiento) + calor de luces y enchufes
//   A/C en frío → el compresor enciende/apaga con histéresis alrededor de la consigna
//   humedad     → baja con la temperatura y cuando el compresor trabaja (deshumidifica)
const C = cfg.CLIMATE;
const hour = hourNow();
const tout = outdoorAt(hour);
const SE = cfg.SENSORS;
const day = daylight(hour);

// Eventos domésticos al azar (o pedidos desde la interfaz): cocinar y ducharse
const startRandom = (key, every, durSec) => { if (S.ev[key] <= now && every > 0 && Math.random() < 1 / every) S.ev[key] = now + durSec * 1000; };
startRandom('heat', SE.events.heatKitchen.everySec, SE.events.heatKitchen.durationSec);
startRandom('hum', SE.events.humidityBath.everySec, SE.events.humidityBath.durationSec);
S.lvl.heat += ((S.ev.heat > now ? 1 : 0) - S.lvl.heat) * 0.08;   // suben y bajan despacio, como una sonda real
S.lvl.hum += ((S.ev.hum > now ? 1 : 0) - S.lvl.hum) * 0.08;

// Vatios de luces y enchufes por habitación (ganancia de calor)
const loads = {};
for (const l of cfg.LIGHTS) {
  const st = S.lights[l.id];
  if (st.on) loads[l.room] = (loads[l.room] || 0) + (st.intensity / 100) * cfg.METER.lightMaxW;
}
for (const p of cfg.PLUGS) {
  const st = S.plugs[p.id];
  if (st.on) loads[p.room] = (loads[p.room] || 0) + st.watts;
}

function runAc(ac, roomTemp) {
  const f = cfg.AC_POWER.fanFactor[ac.fan];
  let running = ac.running;
  if (ac.on && ac.mode === 'cool') {
    if (!running && roomTemp > ac.setpoint + C.hysteresis) running = true;
    else if (running && roomTemp < ac.setpoint - C.hysteresis) {
      running = false;
      if (!S.acReached[ac.id]) {                       // avisar solo la primera vez
        S.acReached[ac.id] = true;
        log('info', 'A/C ' + nameOf(cfg.AIR_CONDITIONERS, ac.id), 'Alcanzó ' + ac.setpoint + ' °C');
      }
    }
  } else running = false;
  ac.running = running;
  ac.watts = !ac.on ? 0 : running ? Math.round(cfg.AC_POWER.coolingW * f * (0.92 + Math.random() * 0.16)) : Math.round(cfg.AC_POWER.fanW * f);
  return running ? C.coolPerTick * f : 0;
}

for (const room of cfg.ROOMS) {
  const st = S.rooms[room.id];
  const target = tout - C.insulation + ((loads[room.id] || 0) / 1000) * C.gainPerKw;
  st.t += (target - st.t) * C.leakPerTick;
  // Cocinando: la estufa calienta el aire de la cocina mucho más rápido que lo que cambia el resto de la casa
  if (room.id === 'cocina') st.t += (Math.max(st.t, SE.events.heatKitchen.toC) - st.t) * 0.05 * S.lvl.heat;

  let cooling = 0;
  for (const def of cfg.AIR_CONDITIONERS) if (def.room === room.id) cooling += runAc(S.acs[def.id], st.t);
  st.t -= cooling;
  st.t += (Math.random() - 0.5) * 0.03;

  let hTarget = clamp(78 - (st.t - 20) * 2.2 - (cooling > 0 ? 10 : 0), 32, 90);
  if (room.id === 'bano_principal') hTarget += (SE.events.humidityBath.toPct - hTarget) * S.lvl.hum;   // ducha
  st.h = clamp(st.h + (hTarget - st.h) * 0.06 + gauss() * SE.noise.humidity * 0.5, 20, 99);

  // Luminosidad (luxómetro): luz natural por las ventanas + la de los bombillos encendidos de la habitación
  const lf = SE.luxFactor[room.id] !== undefined ? SE.luxFactor[room.id] : SE.luxFactor.default;
  let artificial = 0;
  for (const l of cfg.LIGHTS) if (l.room === room.id && S.lights[l.id].on) artificial += (S.lights[l.id].intensity / 100) * SE.luxPerLightAt100;
  st.lux = Math.max(0, day * SE.luxMaxIndoor * lf + artificial + gauss() * SE.noise.lux * (day > 0 || artificial > 0 ? 1 : 0.2));
}

// Solo se publica el A/C si cambió algo (menos tráfico por el WebSocket)
for (const def of cfg.AIR_CONDITIONERS) {
  const a = S.acs[def.id];
  const prev = S.last.ac[a.id];
  if (!prev || prev.running !== a.running || prev.watts !== a.watts) {
    S.last.ac[a.id] = { running: a.running, watts: a.watts };
    out.push({ type: 'ac', id: a.id, patch: { running: a.running, watts: a.watts } });
  }
}
out.push({ type: 'climate', ts: now, rooms: climateRooms(), world: worldNow() });
return done();
