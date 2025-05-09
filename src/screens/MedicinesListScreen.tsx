import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { removeMedicineFromHistory, completelyRemoveMedicine } from '../utils/historyService';
import { cancelMedicineNotification } from '../utils/notifications';
import { removeFromHistory } from '../utils/historyService';

// Rozszerzony interfejs MedicineData
interface MedicineData {
  id: string;
  name: string;
  dosage: string;
  isRegular: boolean;
  times?: string[];
  selectedDays?: boolean[];
  oneTimeDate?: string;
  oneTimeTime?: string;
  quantity?: number;
  completed?: boolean; // nowe pole do oznaczania ukończonych leków jednorazowych
}

const MedicinesListScreen = ({ navigation, route }) => {
  const [searchText, setSearchText] = useState('');
  const [medicines, setMedicines] = useState<MedicineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortOption, setSortOption] = useState<'name' | 'date'>('date');
  const [showCompleted, setShowCompleted] = useState(false);

  useEffect(() => {
    loadMedicines();
    const unsubscribe = navigation.addListener('focus', () => {
      console.log('MedicinesListScreen focused - refreshing data');
      loadMedicines();
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    if (route.params?.updatedMedicine) {
      const updatedMedicine = route.params.updatedMedicine;
      setMedicines(currentMedicines => {
        const medicineIndex = currentMedicines.findIndex(med => med.id === updatedMedicine.id);
        if (medicineIndex !== -1) {
          const newMedicines = [...currentMedicines];
          newMedicines[medicineIndex] = updatedMedicine;
          saveMedicines(newMedicines);
          return sortMedicines(newMedicines, sortOption);
        } else {
          const newMedicines = [...currentMedicines, updatedMedicine];
          saveMedicines(newMedicines);
          return sortMedicines(newMedicines, sortOption);
        }
      });
      navigation.setParams({ updatedMedicine: null });
    }
  }, [route.params?.updatedMedicine]);

  const sortMedicines = (medicinesList: MedicineData[], option: 'name' | 'date'): MedicineData[] => {
    return [...medicinesList].sort((a, b) => {
      if ((a.completed && !b.completed) || (!a.isRegular && a.completed && b.isRegular)) {
        return 1;
      }
      if ((b.completed && !a.completed) || (!b.isRegular && b.completed && a.isRegular)) {
        return -1;
      }
      if (option === 'name') {
        return a.name.localeCompare(b.name);
      } else {
        if (!a.isRegular && !b.isRegular) {
          const dateA = new Date(a.oneTimeDate);
          const dateB = new Date(b.oneTimeDate);
          return dateA.getTime() - dateB.getTime();
        } else if (!a.isRegular && !a.completed) {
          return -1;
        } else if (!b.isRegular && !b.completed) {
          return 1;
        } else {
          return a.name.localeCompare(b.name);
        }
      }
    });
  };

  const checkOneTimeMedicines = async (medicinesList: MedicineData[]): Promise<MedicineData[]> => {
    try {
      const historyJson = await AsyncStorage.getItem('medicineHistory');
      if (!historyJson) return medicinesList;
      const history = JSON.parse(historyJson);
      let updated = false;
      const updatedMedicines = medicinesList.map(medicine => {
        if (!medicine.isRegular && !medicine.completed) {
          const oneTimeDate = new Date(medicine.oneTimeDate);
          const dateString = oneTimeDate.toISOString().split('T')[0];
          if (history[dateString]) {
            const record = history[dateString].find(
              entry => entry.id.startsWith(`${medicine.id}_`) && entry.status === 'taken'
            );
            if (record) {
              updated = true;
              return { ...medicine, completed: true };
            }
          }
        }
        return medicine;
      });
      if (updated) {
        await AsyncStorage.setItem('medicines', JSON.stringify(updatedMedicines));
      }
      return updatedMedicines;
    } catch (error) {
      console.error('Error checking one-time medicines status:', error);
      return medicinesList;
    }
  };

  const loadMedicines = useCallback(async () => {
    try {
      setLoading(true);
      console.log('Loading medicines data...');
      const storedMedicines = await AsyncStorage.getItem('medicines');
      if (storedMedicines) {
        let parsedMedicines = JSON.parse(storedMedicines);
        parsedMedicines = await checkOneTimeMedicines(parsedMedicines);
        const sortedMedicines = sortMedicines(parsedMedicines, sortOption);
        setMedicines(sortedMedicines);
        console.log(`Loaded and sorted ${sortedMedicines.length} medicines`);
      } else {
        setMedicines([]);
        console.log('No medicines found in storage');
      }
    } catch (error) {
      console.error('Error loading medicines:', error);
      Alert.alert('Błąd', 'Nie udało się wczytać danych.');
    } finally {
      setLoading(false);
    }
  }, [sortOption]);

  const saveMedicines = async (medicinesData) => {
    try {
      await AsyncStorage.setItem('medicines', JSON.stringify(medicinesData));
    } catch (error) {
      console.error('Error saving medicines:', error);
      Alert.alert('Błąd', 'Nie udało się zapisać danych.');
    }
  };

  const toggleSortOption = () => {
    const newOption = sortOption === 'name' ? 'date' : 'name';
    setSortOption(newOption);
    setMedicines(currentMedicines => sortMedicines(currentMedicines, newOption));
  };

  const toggleCompletedView = () => {
    setShowCompleted(!showCompleted);
  };

  const filterMedicinesByCompletion = (medicinesList: MedicineData[]) => {
    if (showCompleted) {
      return medicinesList.filter(med => med.completed);
    } else {
      return medicinesList.filter(med => !med.completed);
    }
  };

  const filteredAndSortedMedicines = filterMedicinesByCompletion(medicines)
    .filter(medicine => medicine.name.toLowerCase().includes(searchText.toLowerCase()));

  const getScheduleDisplay = (medicine) => {
    if (medicine.isRegular) {
      const activeDaysCount = medicine.selectedDays.filter(Boolean).length;
      const daysText = activeDaysCount === 7 ? 'codziennie' : `${activeDaysCount} dni w tygodniu`;
      return `${medicine.dosage} - ${medicine.times.length}x ${daysText}`;
    } else {
      const date = new Date(medicine.oneTimeDate);
      const formattedDate = date.toLocaleDateString('pl-PL', {
        day: 'numeric',
        month: 'short'
      });
      return `${medicine.dosage} - jednorazowo ${formattedDate}`;
    }
  };

  const renderItem = ({ item }) => {
    const isLow = item.isRegular && item.quantity !== undefined && item.quantity < 5;
    return (
      <TouchableOpacity 
        style={[styles.medicineItem, item.completed && styles.completedMedicineItem]}
        onPress={() => navigation.navigate('MedicineDetails', { medicineId: item.id })}
      >
        <View style={styles.iconContainer}>
          <Ionicons 
            name={item.isRegular ? "repeat" : item.completed ? "checkmark-circle" : "calendar"} 
            size={24} 
            color={item.completed ? "#4CAF50" : "#4a86e8"} 
          />
        </View>
        <View style={styles.medicineInfo}>
          <View style={styles.medicineNameRow}>
            <Text style={styles.medicineName}>{item.name}</Text>
            {item.isRegular && item.quantity !== undefined && (
              <View style={[styles.pillCountContainer, isLow && styles.pillCountLow]}>
                <Text style={[styles.pillCountText, isLow && styles.pillCountTextLow]}>
                  {item.quantity} {item.quantity === 1 ? 'tabletka' : 
                    (item.quantity > 1 && item.quantity < 5) ? 'tabletki' : 'tabletek'}
                </Text>
                {isLow && (
                  <Ionicons name="warning-outline" size={14} color="#f44336" />
                )}
              </View>
            )}
          </View>
          <Text style={styles.medicineDetails}>{getScheduleDisplay(item)}</Text>
        </View>
        <TouchableOpacity 
          style={styles.moreButton}
          onPress={() => navigation.navigate('MedicineDetails', { medicineId: item.id })}
        >
          <Text style={styles.moreButtonText}>Więcej</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Szukaj leku..."
          value={searchText}
          onChangeText={setSearchText}
        />
        <TouchableOpacity onPress={toggleSortOption} style={styles.sortButton}>
          <Ionicons 
            name={sortOption === 'name' ? "text" : "calendar"} 
            size={20} 
            color="#4a86e8" 
          />
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleCompletedView} style={[styles.sortButton, showCompleted && styles.activeFilterButton]}>
          <Ionicons 
            name="checkmark-circle" 
            size={20} 
            color={showCompleted ? "#fff" : "#4a86e8"} 
          />
        </TouchableOpacity>
        <TouchableOpacity onPress={loadMedicines} style={styles.refreshButton}>
          <Ionicons name="refresh" size={20} color="#4a86e8" />
        </TouchableOpacity>
      </View>
      
      {loading ? (
        <View style={styles.centerContainer}>
          <Text>Ładowanie...</Text>
        </View>
      ) : medicines.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>Nie dodano jeszcze żadnych leków</Text>
          <TouchableOpacity 
            style={styles.emptyButton}
            onPress={() => navigation.navigate('AddEditMedicine')}
          >
            <Text style={styles.emptyButtonText}>Dodaj pierwszy lek</Text>
          </TouchableOpacity>
        </View>
      ) : filteredAndSortedMedicines.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>
            {showCompleted ? 
              'Nie masz żadnych ukończonych leków' : 
              'Nie znaleziono leków pasujących do wyszukiwania'}
          </Text>
          {showCompleted && (
            <TouchableOpacity 
              style={styles.emptyButton}
              onPress={toggleCompletedView}
            >
              <Text style={styles.emptyButtonText}>Powrót do aktywnych leków</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filteredAndSortedMedicines}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          style={styles.list}
          onRefresh={loadMedicines}
          refreshing={loading}
        />
      )}
      
      {!showCompleted && (
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => navigation.navigate('AddEditMedicine')}
        >
          <Ionicons name="add" size={30} color="white" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    position: 'relative',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
    marginHorizontal: 16,
  },
  searchInput: {
    flex: 1,
    padding: 10,
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  refreshButton: {
    padding: 10,
    marginLeft: 8,
  },
  sortButton: {
    padding: 10,
    marginLeft: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  activeFilterButton: {
    backgroundColor: '#4a86e8',
  },
  list: {
    flex: 1,
  },
  medicineItem: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 8,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  completedMedicineItem: {
    backgroundColor: '#f9f9f9',
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  iconContainer: {
    marginRight: 16,
  },
  medicineInfo: {
    flex: 1,
  },
  medicineNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  medicineName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  pillCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0e0e0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  pillCountLow: {
    backgroundColor: '#ffebee',
  },
  pillCountText: {
    fontSize: 12,
    color: '#333',
    marginRight: 4,
  },
  pillCountTextLow: {
    color: '#f44336',
  },
  medicineDetails: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  moreButton: {
    backgroundColor: '#4a86e8',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  moreButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  addButton: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4a86e8',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  emptyButton: {
    backgroundColor: '#4a86e8',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default MedicinesListScreen;