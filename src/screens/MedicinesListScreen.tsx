import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { removeMedicineFromHistory, completelyRemoveMedicine } from '../utils/historyService';
import { cancelMedicineNotification } from '../utils/notifications';
import { removeFromHistory } from '../utils/historyService';

const MedicinesListScreen = ({ navigation, route }) => {
  const [searchText, setSearchText] = useState('');
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);

  // ładowanie leków z pamięci i dodanie lepszej funkcji czyszczenia
  useEffect(() => {
    loadMedicines();
    
    // focus listener do odświeżania jak ekran będzie widoczny
    const unsubscribe = navigation.addListener('focus', () => {
      console.log('MedicinesListScreen focused - refreshing data');
      loadMedicines();
    });
    
    return unsubscribe;
  }, [navigation]);

  // obsługa aktualizacji danych po edycji
  useEffect(() => {
    if (route.params?.updatedMedicine) {
      const updatedMedicine = route.params.updatedMedicine;
      
      setMedicines(currentMedicines => {
        const medicineIndex = currentMedicines.findIndex(med => med.id === updatedMedicine.id);
        
        if (medicineIndex !== -1) {
          // aktualizacja istniejącego leku
          const newMedicines = [...currentMedicines];
          newMedicines[medicineIndex] = updatedMedicine;
          saveMedicines(newMedicines);
          return newMedicines;
        } else {
          // nowy lek do dodania
          const newMedicines = [...currentMedicines, updatedMedicine];
          saveMedicines(newMedicines);
          return newMedicines;
        }
      });
      
      // czyszczymy parametr żeby nie przetwarzać znowu
      navigation.setParams({ updatedMedicine: null });
    }
  }, [route.params?.updatedMedicine]);

  // lepsza funkcja do ładowania leków która czyści też usunięte rzeczy
  const loadMedicines = useCallback(async () => {
    try {
      setLoading(true);
      console.log('Loading medicines data...');
      
      const storedMedicines = await AsyncStorage.getItem('medicines');
      if (storedMedicines) {
        const parsedMedicines = JSON.parse(storedMedicines);
        setMedicines(parsedMedicines);
        console.log(`Loaded ${parsedMedicines.length} medicines`);
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
  }, []);

  // zapis leków do AsyncStorage
  const saveMedicines = async (medicinesData) => {
    try {
      await AsyncStorage.setItem('medicines', JSON.stringify(medicinesData));
    } catch (error) {
      console.error('Error saving medicines:', error);
      Alert.alert('Błąd', 'Nie udało się zapisać danych.');
    }
  };

  // obsługa zapisu leku z AddEditMedicineScreen
  const handleSaveMedicine = (medicine) => {
    navigation.setParams({ updatedMedicine: medicine });
  };

  // funkcja do wymuszenia odświeżenia danych w innych ekranach po usunięciu
  const notifyMedicineDeleted = async (id) => {
    // to moglby być lepsze z Reduxem albo Context API xd
    try {
      // zapis flagi w AsyncStorage ktorą inne ekrany mogą sprawdzać
      await AsyncStorage.setItem('lastDeletedMedicine', JSON.stringify({
        id,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error('Error setting deletion notification:', error);
    }
  };

  // lepsza funkcja usuwania co usuwa tylko planowane wpisy
  const deleteMedicine = (id) => {
    Alert.alert(
      'Usuń lek',
      'Czy na pewno chcesz usunąć ten lek? Wszystkie zaplanowane dawki zostaną usunięte.',
      [
        { text: 'Anuluj', style: 'cancel' },
        { 
          text: 'Usuń', 
          onPress: async () => {
            try {
              setLoading(true); // pokaż ładowanie żeby nie klikali 2x
              
              console.log(`Starting deletion process for medicine: ${id}`);
              
              // anulujemy powiadomienia
              await cancelMedicineNotification(id);
              
              // usuwamy tylko zaplanowane wpisy z historii
              await removeFromHistory(id, true);
              
              // usuwamy z listy leków w pamięci
              const storedMedicinesJson = await AsyncStorage.getItem('medicines');
              if (storedMedicinesJson) {
                const storedMedicines = JSON.parse(storedMedicinesJson);
                const updatedMedicines = storedMedicines.filter(med => med.id !== id);
                await AsyncStorage.setItem('medicines', JSON.stringify(updatedMedicines));
              }
              
              // aktualizacja lokalnego stanu od razu
              setMedicines(prevMedicines => {
                const updatedMedicines = prevMedicines.filter(med => med.id !== id);
                console.log(`Updated medicines list now contains ${updatedMedicines.length} items`);
                return updatedMedicines;
              });
              
              // daj znać innym ekranom o usunięciu
              await AsyncStorage.setItem('lastDeletedMedicine', JSON.stringify({
                id,
                timestamp: Date.now(),
                onlyPlanned: true
              }));
              
              console.log(`Medicine ${id} successfully deleted`);
              
              // pokaż komunikat dla użytkownika
              Alert.alert('Sukces', 'Lek został usunięty.');
            } catch (error) {
              console.error('Error deleting medicine:', error);
              Alert.alert('Błąd', 'Nie udało się usunąć leku.');
            } finally {
              setLoading(false); // schowaj loader
            }
          },
          style: 'destructive'
        },
      ]
    );
  };

  const filteredMedicines = medicines.filter(medicine => 
    medicine.name.toLowerCase().includes(searchText.toLowerCase())
  );

  // Formatowanie wyświetlania harmonogramu
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

  const renderItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.medicineItem}
      onPress={() => navigation.navigate('MedicineDetails', { medicineId: item.id })}
    >
      <View style={styles.iconContainer}>
        <Ionicons 
          name={item.isRegular ? "repeat" : "calendar"} 
          size={24} 
          color="#4a86e8" 
        />
      </View>
      <View style={styles.medicineInfo}>
        <Text style={styles.medicineName}>{item.name}</Text>
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

  // Zaktualizowany render z przyciskiem odświeżania i wskaźnikiem ładowania
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Szukaj leku..."
          value={searchText}
          onChangeText={setSearchText}
        />
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
      ) : (
        <FlatList
          data={filteredMedicines}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          style={styles.list}
          onRefresh={loadMedicines}
          refreshing={loading}
        />
      )}
      
      <TouchableOpacity 
        style={styles.addButton}
        onPress={() => navigation.navigate('AddEditMedicine')}
      >
        <Ionicons name="add" size={30} color="white" />
      </TouchableOpacity>
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
  iconContainer: {
    marginRight: 16,
  },
  medicineInfo: {
    flex: 1,
  },
  medicineName: {
    fontSize: 16,
    fontWeight: 'bold',
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
