import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatTime, getDateString } from './dateUtils';
import { pl } from 'date-fns/locale';

// typy statusu leku
export type MedicineStatus = 'taken' | 'skipped' | 'planned';

interface Medicine {
  id: string;
  name: string;
  dosage: string;
}

interface MedicineRecord {
  id: string;
  name: string;
  dosage: string;
  time: string;
  status: MedicineStatus;
  timestamp: string;
}

// funkcja do wyświetlania problemów (do debugów)
const debugHistory = async (label = "Current History") => {
  try {
    const historyJson = await AsyncStorage.getItem('medicineHistory');
    console.log(`=== ${label} ===`);
    if (historyJson) {
      const history = JSON.parse(historyJson);
      Object.keys(history).forEach(date => {
        console.log(`Date: ${date}, Records: ${history[date].length}`);
        history[date].forEach((record: MedicineRecord, i: number) => {
          console.log(`  #${i+1} ${record.name} (${record.time}): status=${record.status}, timestamp=${record.timestamp}`);
        });
      });
    } else {
      console.log("No history found");
    }
    console.log("================");
  } catch (error) {
    console.error("Error debugging history:", error);
  }
};

// dodaj dawkę leku do historii - ogarnia istniejące rekordy
export const recordMedicineDose = async (medicine: Medicine, status: MedicineStatus = 'planned', date = new Date()) => {
  try {
    await debugHistory("Before recordMedicineDose");
    
    const dateString = getDateString(date);
    const now = new Date();
    
    // bierzemy istniejącą historię
    const historyJson = await AsyncStorage.getItem('medicineHistory');
    const history = historyJson ? JSON.parse(historyJson) : {};
    
    // tworzymy rekord - przyszłe zawsze jako planned
    const isFuture = date > now;
    // domyślny status zależy od daty (planned dla przyszłości, skipped dla przeszłości)
    let defaultStatus: MedicineStatus = isFuture ? 'planned' : 'skipped';
    
    // jak podany status i nie jest w przyszłości to bierzemy podany
    const finalStatus = isFuture ? 'planned' : status;
    
    const formattedTime = formatTime(date);
    
    const medicineRecord = {
      id: `${medicine.id}_${Date.now()}`,
      name: medicine.name,
      dosage: medicine.dosage,
      time: formattedTime,
      status: finalStatus,
      timestamp: date.toISOString()
    };
    
    console.log(`Recording medicine ${medicine.name} for ${dateString}, status=${medicineRecord.status}, isFuture=${isFuture}`);
    
    // dodajemy nowy wpis dla daty jeśli nie ma
    if (!history[dateString]) {
      history[dateString] = [];
    }
    
    // szukamy czy już jest taki lek o tej porze
    const existingIndex = history[dateString].findIndex((record: any) => 
      record.id.startsWith(`${medicine.id}_`) && record.time === formattedTime
    );
    
    if (existingIndex !== -1) {
      console.log(`Updating existing record at index ${existingIndex}`);
      // aktualizuj istniejący rekord ale zachowaj status dla przeszłych
      if (isFuture) {
        // przyszłe zawsze planned
        history[dateString][existingIndex].status = 'planned';
      } else {
        // dla przeszłych aktualizujemy status
        history[dateString][existingIndex].status = status;
      }
      history[dateString][existingIndex].timestamp = date.toISOString();
    } else {
      console.log(`Adding new record`);
      // dodaj nowy rekord
      history[dateString].push(medicineRecord);
    }
    
    // zapisz historię
    await AsyncStorage.setItem('medicineHistory', JSON.stringify(history));
    
    await debugHistory("After recordMedicineDose");
    
    return true;
  } catch (error) {
    console.error('Błąd podczas zapisywania dawki leku:', error);
    return false;
  }
};

// resetuj całą historię i przywróć domyślny stan
export const resetAllHistory = async () => {
  try {
    console.log("Starting complete history reset");
    
    // usuwamy całą historię
    await AsyncStorage.removeItem('medicineHistory');
    
    // tworzymy pustą historię
    const emptyHistory = {};
    await AsyncStorage.setItem('medicineHistory', JSON.stringify(emptyHistory));
    
    // pobierz zapisane leki żeby odtworzyć wpisy
    const medicinesJson = await AsyncStorage.getItem('medicines');
    if (!medicinesJson) {
      console.log("No medicines found to restore");
      return true;
    }
    
    const medicines = JSON.parse(medicinesJson);
    console.log(`Found ${medicines.length} medicines to restore`);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // tworzymy wpisy dla każdego leku
    for (const medicine of medicines) {
      console.log(`Processing medicine: ${medicine.name}`);
      
      if (medicine.isRegular) {
        // dla regularnych - dodaj na dziś
        if (medicine.times && medicine.times.length > 0) {
          for (const time of medicine.times) {
            const [hours, minutes] = time.split(':');
            const scheduleTime = new Date(today);
            scheduleTime.setHours(parseInt(hours), parseInt(minutes));
            
            // zawsze jako planned na początek
            console.log(`Adding regular medicine ${medicine.name} at ${time}`);
            await recordMedicineDose(medicine, 'planned', scheduleTime);
          }
        }
      } else {
        // dla jednorazowych
        const oneTimeDate = new Date(medicine.oneTimeDate);
        const [hours, minutes] = medicine.oneTimeTime.split(':');
        oneTimeDate.setHours(parseInt(hours), parseInt(minutes));
        
        // dodaj wpis z odpowiednim statusem
        console.log(`Adding one-time medicine ${medicine.name} on ${oneTimeDate.toISOString()}`);
        await recordMedicineDose(medicine, 'planned', oneTimeDate);
      }
    }
    
    await debugHistory("After history reset");
    return true;
  } catch (error) {
    console.error('Error resetting history:', error);
    return false;
  }
};

// pobierz historię dla konkretnej daty
export const getHistoryForDate = async (date: Date) => {
  try {
    const dateString = getDateString(date);
    const historyJson = await AsyncStorage.getItem('medicineHistory');
    const history = historyJson ? JSON.parse(historyJson) : {};
    return history[dateString] || [];
  } catch (error) {
    console.error('Błąd podczas pobierania historii:', error);
    return [];
  }
};

// usuń historię dla konkretnej daty
export const clearHistoryForDate = async (date: Date) => {
  try {
    const dateString = getDateString(date);
    const historyJson = await AsyncStorage.getItem('medicineHistory');
    const history = historyJson ? JSON.parse(historyJson) : {};
    
    if (history[dateString]) {
      delete history[dateString];
      await AsyncStorage.setItem('medicineHistory', JSON.stringify(history));
    }
    
    return true;
  } catch (error) {
    console.error('Błąd podczas czyszczenia historii:', error);
    return false;
  }
};

// pobierz całą historię leków
export const getMedicineHistory = async () => {
  try {
    // pobierz istniejącą historię
    const historyJson = await AsyncStorage.getItem('medicineHistory');
    return historyJson ? JSON.parse(historyJson) : {};
  } catch (error) {
    console.error('Błąd podczas pobierania historii:', error);
    return {};
  }
};

// aktualizuj konkretny rekord leku
export const updateMedicineRecord = async (dateString: string, medicineId: string, updates: Partial<MedicineRecord>) => {
  try {
    // pobierz istniejącą historię
    const historyJson = await AsyncStorage.getItem('medicineHistory');
    const history = historyJson ? JSON.parse(historyJson) : {};
    
    if (history[dateString]) {
      const medicineIndex = history[dateString].findIndex((med: MedicineRecord) => med.id === medicineId);
      
      if (medicineIndex !== -1) {
        // aktualizuj rekord
        history[dateString][medicineIndex] = {
          ...history[dateString][medicineIndex],
          ...updates
        };
        
        // zapisz zaktualizowaną historię
        await AsyncStorage.setItem('medicineHistory', JSON.stringify(history));
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error updating medicine record:', error);
    return false;
  }
};

// przetwarzaj dane historii dla kalendarza z nowym polem statusu
export const processHistoryForCalendar = (history: Record<string, any>) => {
  const processedHistory: Record<string, any> = {};
  const now = new Date();
  
  // przejdź przez każdą datę w historii
  Object.keys(history).forEach((date: string) => {
    const dayMedicines = history[date];
    
    if (!dayMedicines || !Array.isArray(dayMedicines) || dayMedicines.length === 0) {
      return;
    }
    
    // przetwarzaj każdy lek, aby obsłużyć przeszłe wpisy 'planned'
    const processedMedicines = dayMedicines.map(med => {
      // jeśli jest w przeszłości i nadal oznaczony jako planned, traktuj jako skipped do wyświetlenia
      const medDate = new Date(med.timestamp);
      if (medDate < now && med.status === 'planned') {
        return { ...med, displayStatus: 'skipped' };
      }
      return { ...med, displayStatus: med.status };
    });
    
    // sprawdź statusy leków używając display status
    const allTaken = processedMedicines.every((med: any) => med.displayStatus === 'taken');
    const anyTaken = processedMedicines.some((med: any) => med.displayStatus === 'taken');
    const allSkipped = processedMedicines.every((med: any) => med.displayStatus === 'skipped');
    
    // określ kolor kropki na podstawie statusów leków
    let dotColor = '#FFC107'; // domyślny żółty dla planned
    
    if (allTaken) {
      dotColor = '#4CAF50'; // zielony dla wszystkich taken
    } else if (anyTaken) {
      dotColor = '#FFC107'; // żółty dla niektórych taken
    } else if (allSkipped) {
      dotColor = '#F44336'; // czerwony dla wszystkich skipped
    }
    
    processedHistory[date] = {
      marked: true,
      dotColor: dotColor,
      medicines: dayMedicines // zachowaj oryginalne dane
    };
  });
  
  return processedHistory;
};

// Migracja starego formatu historii
export const migrateLegacyHistory = async () => {
  try {
    // Sprawdź czy mamy historię
    const historyJson = await AsyncStorage.getItem('medicineHistory');
    if (!historyJson) return false;
    
    const history = JSON.parse(historyJson);
    let needsMigration = false;
    
    // Sprawdź czy jest coś w starym formacie
    Object.keys(history).forEach(date => {
      if (history[date] && Array.isArray(history[date])) {
        const records = history[date];
        for (const record of records) {
          // Stary format nie ma pola timestamp
          if (record && !record.timestamp) {
            needsMigration = true;
            break;
          }
        }
      }
    });
    
    if (!needsMigration) {
      console.log("No legacy data found, migration not needed");
      return false;
    }
    
    console.log("Legacy history data found, migrating...");
    
    // migracja
    Object.keys(history).forEach(date => {
      if (history[date] && Array.isArray(history[date])) {
        const records = history[date];
        
        for (let i = 0; i < records.length; i++) {
          const record = records[i];
          
          // dodaj timestamp jeśli nie ma
          if (!record.timestamp) {
            // stwórz timestamp z daty i czasu
            const dateObj = new Date(date);
            if (record.time) {
              const [hours, minutes] = record.time.split(':');
              dateObj.setHours(parseInt(hours), parseInt(minutes));
            }
            record.timestamp = dateObj.toISOString();
          }
          
          // normalizuj status (starsze wersje mogły mieć inny format)
          if (!['taken', 'skipped', 'planned'].includes(record.status)) {
            if (record.status === 'completed' || record.status === 'done') {
              record.status = 'taken';
            } else if (record.status === 'missed') {
              record.status = 'skipped';
            } else {
              record.status = 'planned';
            }
          }
        }
      }
    });
    
    // zapisz zmigrowaną wersję
    await AsyncStorage.setItem('medicineHistory', JSON.stringify(history));
    console.log("Legacy history data migration complete");
    
    return true;
  } catch (error) {
    console.error('Error migrating legacy history:', error);
    return false;
  }
};

// usuń lek z historii z opcją usunięcia tylko zaplanowanych
export const removeFromHistory = async (medicineId: string, onlyPlanned: boolean = true) => {
  try {
    console.log(`Removing medicine ${medicineId} from history (onlyPlanned=${onlyPlanned})`);
    
    // pobierz istniejącą historię
    const historyJson = await AsyncStorage.getItem('medicineHistory');
    if (!historyJson) return false;
    
    const history = JSON.parse(historyJson);
    let modified = false;
    const updatedHistory = {};
    
    // przetwarzaj każdą datę
    for (const date in history) {
      if (history[date] && Array.isArray(history[date])) {
        // filtruj wpisy na podstawie podanych kryteriów
        const initialLength = history[date].length;
        const filteredMedicines = history[date].filter((med: any) => {
          // zachowaj wpisy, które nie należą do tego leku
          if (!med.id.startsWith(`${medicineId}_`)) {
            return true;
          }
          
          // dla wpisów tego leku, filtruj na podstawie statusu jeśli onlyPlanned jest true
          if (onlyPlanned) {
            return med.status !== 'planned';
          } else {
            // usuń wszystkie wpisy dla tego leku
            return false;
          }
        });
        
        // sprawdź czy coś zostało usunięte
        if (filteredMedicines.length < initialLength) {
          modified = true;
        }
        
        // zachowaj tylko daty z pozostałymi wpisami
        if (filteredMedicines.length > 0) {
          updatedHistory[date] = filteredMedicines;
        }
      }
    }
    
    if (modified) {
      // zapisz zaktualizowaną historię
      await AsyncStorage.setItem('medicineHistory', JSON.stringify(updatedHistory));
      
      if (onlyPlanned) {
        console.log(`Successfully removed planned entries for medicine ${medicineId}`);
      } else {
        console.log(`Successfully removed all entries for medicine ${medicineId}`);
      }
    }
    
    return modified;
  } catch (error) {
    console.error('Error removing medicine from history:', error);
    return false;
  }
};

// aktualizuj referencje do leku w historii
export const updateMedicineReferencesInHistory = async (medicineId: string, updatedMedicine: any) => {
  try {
    console.log(`Updating history references for medicine ${medicineId}`, updatedMedicine.name);
    const historyJson = await AsyncStorage.getItem('medicineHistory');
    if (!historyJson) return false;
    
    const history = JSON.parse(historyJson);
    let updated = false;
    
    // dla każdej daty w historii
    for (const date in history) {
      if (history[date] && Array.isArray(history[date])) {
        // znajdź wszystkie rekordy dla tego leku
        const medicineRecords = history[date].filter((record: MedicineRecord) => 
          record.id.startsWith(`${medicineId}_`)
        );
        
        if (medicineRecords.length > 0) {
          console.log(`Found ${medicineRecords.length} records of medicine ${medicineId} on ${date}`);
          
          // obsłuż aktualizacje czasu na podstawie typu leku
          if (updatedMedicine.isRegular) {
            // dla regularnych leków, jeśli czasy się zmieniły, potrzebujemy specjalnej obsługi
            const updatedTimes = updatedMedicine.times || [];
            
            // aktualizuj podstawowe informacje dla wszystkich rekordów
            for (let i = 0; i < history[date].length; i++) {
              const record = history[date][i];
              if (record.id.startsWith(`${medicineId}_`)) {
                // aktualizuj podstawowe informacje
                record.name = updatedMedicine.name;
                record.dosage = updatedMedicine.dosage;
                updated = true;
                
                // jeśli jest pasujący czas w zaktualizowanym leku, zaktualizuj czas też
                // to jest bardziej złożone i może wymagać dodatkowej logiki w zależności od potrzeb aplikacji
              }
            }
          } else {
            // dla jednorazowych leków, zaktualizuj wszystkie pola włącznie z czasem
            for (let i = 0; i < history[date].length; i++) {
              const record = history[date][i];
              if (record.id.startsWith(`${medicineId}_`)) {
                // pobierz datę z timestamp
                const recordDate = new Date(record.timestamp);
                const newDate = new Date(updatedMedicine.oneTimeDate);
                
                // wyciągnij godziny i minuty z oneTimeTime
                const [hours, minutes] = updatedMedicine.oneTimeTime.split(':').map(Number);
                
                // ustaw nowy czas na newDate
                newDate.setHours(hours, minutes, 0, 0);
                
                // zaktualizuj timestamp i sformatowany czas
                record.timestamp = newDate.toISOString();
                record.time = formatTime(newDate);
                
                // zaktualizuj inne pola
                record.name = updatedMedicine.name;
                record.dosage = updatedMedicine.dosage;
                
                updated = true;
                console.log(`Updated one-time medicine record: ${record.name} at ${record.time}`);
              }
            }
          }
        }
      }
    }
    
    // jeśli typ harmonogramu leku zmienił się z regularnego na jednorazowy lub odwrotnie,
    // możemy potrzebować usunąć stare wpisy i dodać nowe
    // to może być zaimplementowane za pomocą removeFromHistory i recordMedicineDose
    
    if (updated) {
      await AsyncStorage.setItem('medicineHistory', JSON.stringify(history));
      console.log(`Updated medicine references in history for medicine ${medicineId}`);
    }
    
    return updated;
  } catch (error) {
    console.error('Error updating medicine references in history:', error);
    return false;
  }
};
