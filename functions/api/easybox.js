// Configurația publică pentru harta de easybox (userul de API nu e secret: îl cere chiar harta Sameday).
const PLUGIN_CLIENT_ID = 'b8cb2ee3-41b9-4c3d-aafe-1527b453d65e'; // clientId-ul public al hărții Sameday (din pluginurile lor oficiale)
// city: orașul aproximat de Cloudflare după conexiunea vizitatorului (doar pentru centrarea hărții, nu se salvează).
const RO = { Bucharest: 'București', Timisoara: 'Timișoara', Iasi: 'Iași', Brasov: 'Brașov', Constanta: 'Constanța', Ploiesti: 'Ploiești', Pitesti: 'Pitești', Galati: 'Galați', Targu_Mures: 'Târgu Mureș', 'Targu Mures': 'Târgu Mureș', Bistrita: 'Bistrița', Buzau: 'Buzău', Floresti: 'Florești', Ramnicu_Valcea: 'Râmnicu Vâlcea', 'Ramnicu Valcea': 'Râmnicu Vâlcea', Botosani: 'Botoșani', Focsani: 'Focșani', Barlad: 'Bârlad', Medias: 'Mediaș', Sighisoara: 'Sighișoara', Targoviste: 'Târgoviște', Targu_Jiu: 'Târgu Jiu', 'Targu Jiu': 'Târgu Jiu', Calarasi: 'Călărași', Slatina: 'Slatina', Resita: 'Reșița', Dej: 'Dej', Turda: 'Turda' };
export const onRequestGet = ({ env, request }) => {
  const cf = request.cf || {}, c = cf.country === 'RO' && cf.city ? (RO[cf.city] || cf.city) : '';
  return new Response(JSON.stringify(env.SAMEDAY_USER
    ? { enabled: true, apiUsername: String(env.SAMEDAY_USER).toLowerCase(), clientId: env.SAMEDAY_LOCKER_CLIENT_ID || PLUGIN_CLIENT_ID, city: c }
    : { enabled: false }), { headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });
};
