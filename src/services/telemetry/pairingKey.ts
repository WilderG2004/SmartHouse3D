/**
 * Clave con la que se emparejó ESTA pestaña. Vive solo en sessionStorage (se borra al cerrar la pestaña) y nunca en un
 * VITE_… ni en el registro. La usan el WebSocket (para volver a emparejar al reconectar) y el historial
 * (Authorization: Bearer … en /api/history/*). Solo se guarda después de que el servidor la acepta.
 * sessionStorage puede no estar disponible (modo privado, bloqueado): la pantalla debe seguir funcionando sin él.
 */
const KEY_STORE = 'casa.pairingKey'

export const pairingKey = {
  get(): string | null {
    try { return sessionStorage.getItem(KEY_STORE) } catch { return null }
  },
  set(k: string) {
    try { sessionStorage.setItem(KEY_STORE, k) } catch { /* sin almacenamiento: la clave no sobrevive a recargar */ }
  },
  clear() {
    try { sessionStorage.removeItem(KEY_STORE) } catch { /* nada */ }
  },
}
