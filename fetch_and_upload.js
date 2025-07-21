const {Firestore} = require('@google-cloud/firestore');
const serviceAccount = require('./serviceAccountKey.json');
const firestore = new Firestore({
  projectId: serviceAccount.project_id,
  credentials: serviceAccount,
});

const COLLECTION = 'flights';

// 1. Получить новые данные (например, из Flightradar24)
async function getNewFlights() {
  // Здесь твой код получения новых рейсов
  // Пусть возвращает массив объектов
  return [
    // Пример:
    // { id: '3b56ae44', ... }
  ];
}

// 2. Получить все рейсы из Firestore
async function getOldFlights() {
  const snapshot = await firestore.collection(COLLECTION).get();
  const flights = {};
  snapshot.forEach(doc => {
    flights[doc.id] = doc.data();
  });
  return flights; // { "id1": {...}, "id2": {...} }
}

// 3. Синхронизация
async function syncFlights() {
  const newFlightsArray = await getNewFlights();
  const oldFlights = await getOldFlights();

  // Преобразуем новые рейсы в объект по id для быстрого поиска
  const newFlights = {};
  newFlightsArray.forEach(flight => {
    newFlights[flight.id] = flight;
  });

  // 1. Добавить новые
  for (const id in newFlights) {
    if (!oldFlights[id]) {
      // Нет в Firestore — добавить
      await firestore.collection(COLLECTION).doc(id).set(newFlights[id]);
      console.log(`Добавлен рейс ${id}`);
    } else {
      // Есть — сравнить и обновить если отличаются
      const oldFlight = JSON.stringify(oldFlights[id]);
      const newFlight = JSON.stringify(newFlights[id]);
      if (oldFlight !== newFlight) {
        await firestore.collection(COLLECTION).doc(id).set(newFlights[id]);
        console.log(`Обновлен рейс ${id}`);
      }
    }
  }

  // 2. Удалить исчезнувшие
  for (const id in oldFlights) {
    if (!newFlights[id]) {
      // В новых данных нет — удалить из Firestore
      await firestore.collection(COLLECTION).doc(id).delete();
      console.log(`Удален рейс ${id}`);
    }
  }
}

syncFlights().then(() => console.log('Синхронизация завершена'));
