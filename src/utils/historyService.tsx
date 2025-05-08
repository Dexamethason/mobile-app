import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatTime, getDateString } from './dateUtils';
import { pl } from 'date-fns/locale';

// Define medicine status types
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

// Debug function to help with troubleshooting
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

// Add a medicine dose to history - properly handle existing records
export const recordMedicineDose = async (medicine: Medicine, status: MedicineStatus = 'planned', date = new Date()) => {
  try {
    await debugHistory("Before recordMedicineDose");
    
    const dateString = getDateString(date);
    const now = new Date();
    
    // Get existing history
    const historyJson = await AsyncStorage.getItem('medicineHistory');
    const history = historyJson ? JSON.parse(historyJson) : {};
    
    // Prepare the record - force planned for future dates
    const isFuture = date > now;
    // Set default status based on date (planned for future, skipped for past)
    let defaultStatus: MedicineStatus = isFuture ? 'planned' : 'skipped';
    
    // If status is provided and date is not in future, use the provided status
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
    
    // Initialize date entry if needed
    if (!history[dateString]) {
      history[dateString] = [];
    }
    
    // Look for an existing record with the same medicine ID and time
    const existingIndex = history[dateString].findIndex((record: any) => 
      record.id.startsWith(`${medicine.id}_`) && record.time === formattedTime
    );
    
    if (existingIndex !== -1) {
      console.log(`Updating existing record at index ${existingIndex}`);
      // Update the existing record but preserve status for past records
      if (isFuture) {
        // For future records, always set status to planned
        history[dateString][existingIndex].status = 'planned';
      } else {
        // For past records, update the status as requested
        history[dateString][existingIndex].status = status;
      }
      history[dateString][existingIndex].timestamp = date.toISOString();
    } else {
      console.log(`Adding new record`);
      // Add as new record
      history[dateString].push(medicineRecord);
    }
    
    // Save updated history
    await AsyncStorage.setItem('medicineHistory', JSON.stringify(history));
    
    await debugHistory("After recordMedicineDose");
    
    return true;
  } catch (error) {
    console.error('Błąd podczas zapisywania dawki leku:', error);
    return false;
  }
};

// Clear all history and reset to default state
export const resetAllHistory = async () => {
  try {
    console.log("Starting complete history reset");
    
    // Completely remove the current history
    await AsyncStorage.removeItem('medicineHistory');
    
    // Create a new empty history object
    const emptyHistory = {};
    await AsyncStorage.setItem('medicineHistory', JSON.stringify(emptyHistory));
    
    // Get saved medicines to recreate proper entries
    const medicinesJson = await AsyncStorage.getItem('medicines');
    if (!medicinesJson) {
      console.log("No medicines found to restore");
      return true;
    }
    
    const medicines = JSON.parse(medicinesJson);
    console.log(`Found ${medicines.length} medicines to restore`);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Create history entries for each medicine
    for (const medicine of medicines) {
      console.log(`Processing medicine: ${medicine.name}`);
      
      if (medicine.isRegular) {
        // For regular medicine, create entries for today
        if (medicine.times && medicine.times.length > 0) {
          for (const time of medicine.times) {
            const [hours, minutes] = time.split(':');
            const scheduleTime = new Date(today);
            scheduleTime.setHours(parseInt(hours), parseInt(minutes));
            
            // Always create with status=planned initially
            console.log(`Adding regular medicine ${medicine.name} at ${time}`);
            await recordMedicineDose(medicine, 'planned', scheduleTime);
          }
        }
      } else {
        // For one-time medicine
        const oneTimeDate = new Date(medicine.oneTimeDate);
        const [hours, minutes] = medicine.oneTimeTime.split(':');
        oneTimeDate.setHours(parseInt(hours), parseInt(minutes));
        
        // Create entry with appropriate status
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

// Get history for a specific date
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

// Clear history for a specific date
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

// Get full medicine history
export const getMedicineHistory = async () => {
  try {
    // Get existing history
    const historyJson = await AsyncStorage.getItem('medicineHistory');
    return historyJson ? JSON.parse(historyJson) : {};
  } catch (error) {
    console.error('Błąd podczas pobierania historii:', error);
    return {};
  }
};

// Update a specific medicine record
export const updateMedicineRecord = async (dateString: string, medicineId: string, updates: Partial<MedicineRecord>) => {
  try {
    // Get existing history
    const historyJson = await AsyncStorage.getItem('medicineHistory');
    const history = historyJson ? JSON.parse(historyJson) : {};
    
    if (history[dateString]) {
      const medicineIndex = history[dateString].findIndex((med: MedicineRecord) => med.id === medicineId);
      
      if (medicineIndex !== -1) {
        // Update the record
        history[dateString][medicineIndex] = {
          ...history[dateString][medicineIndex],
          ...updates
        };
        
        // Save updated history
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

// Process history data for calendar display with the new status field
export const processHistoryForCalendar = (history: Record<string, any>) => {
  const processedHistory: Record<string, any> = {};
  const now = new Date();
  
  // Go through each date in history
  Object.keys(history).forEach((date: string) => {
    const dayMedicines = history[date];
    
    if (!dayMedicines || !Array.isArray(dayMedicines) || dayMedicines.length === 0) {
      return;
    }
    
    // Process each medicine to handle past 'planned' entries
    const processedMedicines = dayMedicines.map(med => {
      // If it's in the past and still marked as planned, treat it as skipped for display
      const medDate = new Date(med.timestamp);
      if (medDate < now && med.status === 'planned') {
        return { ...med, displayStatus: 'skipped' };
      }
      return { ...med, displayStatus: med.status };
    });
    
    // Check medicine statuses using display status
    const allTaken = processedMedicines.every((med: any) => med.displayStatus === 'taken');
    const anyTaken = processedMedicines.some((med: any) => med.displayStatus === 'taken');
    const allSkipped = processedMedicines.every((med: any) => med.displayStatus === 'skipped');
    
    // Determine dot color based on medicine statuses
    let dotColor = '#FFC107'; // Default yellow for planned
    
    if (allTaken) {
      dotColor = '#4CAF50'; // Green for all taken
    } else if (anyTaken) {
      dotColor = '#FFC107'; // Yellow for some taken
    } else if (allSkipped) {
      dotColor = '#F44336'; // Red for all skipped
    }
    
    processedHistory[date] = {
      marked: true,
      dotColor: dotColor,
      medicines: dayMedicines // Keep the original data
    };
  });
  
  return processedHistory;
};

// Convert legacy 'taken' boolean to status format
export const migrateLegacyHistory = async () => {
  try {
    const historyJson = await AsyncStorage.getItem('medicineHistory');
    if (!historyJson) return false;
    
    const history = JSON.parse(historyJson);
    let updated = false;
    
    // Check each date
    for (const date in history) {
      if (history[date] && Array.isArray(history[date])) {
        // Check each medicine in this date
        for (let i = 0; i < history[date].length; i++) {
          const med = history[date][i];
          
          // If the record uses the old 'taken' boolean format
          if (med.hasOwnProperty('taken') && !med.hasOwnProperty('status')) {
            // Convert to new status format
            med.status = med.taken ? 'taken' : 'skipped';
            delete med.taken;
            updated = true;
          }
        }
      }
    }
    
    if (updated) {
      // Save the updated history
      await AsyncStorage.setItem('medicineHistory', JSON.stringify(history));
      console.log('Successfully migrated legacy history');
    }
    
    return updated;
  } catch (error) {
    console.error('Error migrating legacy history:', error);
    return false;
  }
};

// Selectively remove medicine entries from history based on status
export const removeFromHistory = async (medicineId: string, onlyPlanned: boolean = true) => {
  try {
    console.log(`Removing medicine ${medicineId} from history (onlyPlanned=${onlyPlanned})`);
    
    // Get current history
    const historyJson = await AsyncStorage.getItem('medicineHistory');
    if (!historyJson) return false;
    
    const history = JSON.parse(historyJson);
    let modified = false;
    const updatedHistory = {};
    
    // Process each date
    for (const date in history) {
      if (history[date] && Array.isArray(history[date])) {
        // Filter entries based on the provided criteria
        const initialLength = history[date].length;
        const filteredMedicines = history[date].filter((med: any) => {
          // Keep entries that don't belong to this medicine
          if (!med.id.startsWith(`${medicineId}_`)) {
            return true;
          }
          
          // For this medicine's entries, filter based on status if onlyPlanned is true
          if (onlyPlanned) {
            return med.status !== 'planned';
          } else {
            // Remove all entries for this medicine
            return false;
          }
        });
        
        // Check if anything was removed
        if (filteredMedicines.length < initialLength) {
          modified = true;
        }
        
        // Only keep dates with remaining entries
        if (filteredMedicines.length > 0) {
          updatedHistory[date] = filteredMedicines;
        }
      }
    }
    
    if (modified) {
      // Save the updated history
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

// Update medicine references in history when a medicine is edited
export const updateMedicineReferencesInHistory = async (medicineId: string, updatedMedicine: any) => {
  try {
    console.log(`Updating history references for medicine ${medicineId}`, updatedMedicine.name);
    const historyJson = await AsyncStorage.getItem('medicineHistory');
    if (!historyJson) return false;
    
    const history = JSON.parse(historyJson);
    let updated = false;
    
    // For each date in history
    for (const date in history) {
      if (history[date] && Array.isArray(history[date])) {
        // Find all records for this medicine
        const medicineRecords = history[date].filter((record: MedicineRecord) => 
          record.id.startsWith(`${medicineId}_`)
        );
        
        if (medicineRecords.length > 0) {
          console.log(`Found ${medicineRecords.length} records of medicine ${medicineId} on ${date}`);
          
          // Handle time updates based on medicine type
          if (updatedMedicine.isRegular) {
            // For regular medicines, if times have changed we need special handling
            const updatedTimes = updatedMedicine.times || [];
            
            // Update basic info for all records
            for (let i = 0; i < history[date].length; i++) {
              const record = history[date][i];
              if (record.id.startsWith(`${medicineId}_`)) {
                // Update basic information
                record.name = updatedMedicine.name;
                record.dosage = updatedMedicine.dosage;
                updated = true;
                
                // If there's a matching time in the updated medicine, update time too
                // This is more complex and might require additional logic based on your app's needs
              }
            }
          } else {
            // For one-time medicines, update all fields including time
            for (let i = 0; i < history[date].length; i++) {
              const record = history[date][i];
              if (record.id.startsWith(`${medicineId}_`)) {
                // Get the date from timestamp
                const recordDate = new Date(record.timestamp);
                const newDate = new Date(updatedMedicine.oneTimeDate);
                
                // Extract hours and minutes from oneTimeTime
                const [hours, minutes] = updatedMedicine.oneTimeTime.split(':').map(Number);
                
                // Set the new time on the newDate
                newDate.setHours(hours, minutes, 0, 0);
                
                // Update the timestamp and formatted time
                record.timestamp = newDate.toISOString();
                record.time = formatTime(newDate);
                
                // Update other fields
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
    
    // If the medicine's schedule type changed from regular to one-time or vice versa,
    // we might need to remove old entries and add new ones
    // This could be implemented with removeFromHistory and recordMedicineDose
    
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
