'use strict';

window.ObservationsConfig = Object.freeze({
  location: {
    name: 'Brûlain',
    latitude: 46.2006,
    longitude: -0.3194,
    timezone: 'Europe/Paris'
  },

  metarStations: [
    { id: 'LFBN', name: 'Niort–Marais Poitevin' },
    { id: 'LFBH', name: 'La Rochelle–Île de Ré' },
    { id: 'LFBI', name: 'Poitiers–Biard' }
  ],

  webcams: [
    /*
    Exemple :
    {
      name: 'Vue du jardin',
      description: 'Caméra orientée vers le potager',
      imageUrl: 'https://exemple.fr/image.jpg',
      pageUrl: 'https://exemple.fr/webcam'
    }
    */
  ],

  lightningPageUrl: 'https://map.blitzortung.org/'
});
