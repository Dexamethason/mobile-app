import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Switch, 
  TouchableOpacity, 
  Alert,
  ScrollView,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { recordMedicineDose, resetAllHistory } from '../utils/historyService';

const SettingsScreen = () => {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [selectedSound, setSelectedSound] = useState('default');
  const [syncEnabled, setSyncEnabled] = useState(false);

  const soundOptions = [
    { id: 'default', name: 'Domyślny' },
    { id: 'bell', name: 'Dzwonek' },
    { id: 'chime', name: 'Gong' },
    { id: 'alert', name: 'Alert' },
  ];

  const toggleNotifications = () => {
    setNotificationsEnabled(!notificationsEnabled);
  };

  const toggleSync = () => {
    setSyncEnabled(!syncEnabled);
  };

  const selectSound = (soundId: string) => {
    setSelectedSound(soundId);
  };

  // resetuje całą historię i migruje do nowego formatu statusów
  const resetHistory = async () => {
    Alert.alert(
      'Reset historii',
      'Wybierz rodzaj resetu historii:',
      [
        {
          text: 'Anuluj',
          style: 'cancel',
        },
        { 
          text: 'Reset z odtworzeniem', 
          onPress: async () => {
            try {
              const success = await resetAllHistory(true);
              
              if (success) {
                Alert.alert('Sukces', 'Historia została zresetowana i zaplanowane leki zostały ponownie wczytane.');
              } else {
                Alert.alert('Błąd', 'Wystąpił problem podczas resetowania historii.');
              }
            } catch (error) {
              console.error('Błąd podczas resetowania historii:', error);
              Alert.alert('Błąd', 'Nie udało się zresetować historii.');
            }
          },
        },
        { 
          text: 'Pełny reset', 
          onPress: async () => {
            try {
              const success = await resetAllHistory(false);
              
              if (success) {
                Alert.alert('Sukces', 'Historia została całkowicie wyczyszczona bez odtwarzania wpisów.');
              } else {
                Alert.alert('Błąd', 'Wystąpił problem podczas resetowania historii.');
              }
            } catch (error) {
              console.error('Błąd podczas resetowania historii:', error);
              Alert.alert('Błąd', 'Nie udało się zresetować historii.');
            }
          },
          style: 'destructive'
        },
      ],
    );
  };

  const testNotification = async () => {
    try {
      // najpierw uprawnienia
      const { status } = await Notifications.requestPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(
          'Powiadomienia wyłączone',
          'Aby otrzymywać powiadomienia, włącz je w ustawieniach urządzenia.',
          [{ text: 'OK' }]
        );
        return;
      }

      // wysyłamy powiadomienie testowe od razu
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Test powiadomień',
          body: 'To jest testowe powiadomienie o leku.',
          sound: selectedSound === 'default' ? undefined : selectedSound,
          data: { screen: 'Reminders' },
        },
        trigger: null, // null znaczy że powiadomienie wyskoczy od razu
      });

      Alert.alert('Sukces', 'Testowe powiadomienie zostało wysłane.');
    } catch (error) {
      console.log('Error sending notification:', error);
      Alert.alert('Błąd', 'Nie udało się wysłać powiadomienia testowego.');
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Powiadomienia</Text>
        
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Włącz powiadomienia</Text>
            <Text style={styles.settingDescription}>
              Otrzymuj przypomnienia o zażyciu leków
            </Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={toggleNotifications}
            trackColor={{ false: "#767577", true: "#4a86e8" }}
          />
        </View>

        {notificationsEnabled && (
          <View style={styles.soundOptionsContainer}>
            <Text style={styles.settingSubLabel}>Dźwięk powiadomienia</Text>
            {soundOptions.map((sound) => (
              <TouchableOpacity
                key={sound.id}
                style={styles.soundOption}
                onPress={() => selectSound(sound.id)}
              >
                <Text style={styles.soundName}>{sound.name}</Text>
                {selectedSound === sound.id && (
                  <Ionicons name="checkmark-circle" size={24} color="#4a86e8" />
                )}
              </TouchableOpacity>
            ))}

            {/* przycisk do testów */}
            <TouchableOpacity 
              style={styles.testButton}
              onPress={testNotification}
            >
              <Ionicons name="notifications" size={20} color="white" />
              <Text style={styles.buttonText}>Testuj powiadomienie</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Dane</Text>
        
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Synchronizacja danych</Text>
            <Text style={styles.settingDescription}>
              Synchronizuj dane między urządzeniami
            </Text>
          </View>
          <Switch
            value={syncEnabled}
            onValueChange={toggleSync}
            trackColor={{ false: "#767577", true: "#4a86e8" }}
          />
        </View>

        <TouchableOpacity style={styles.button} onPress={resetHistory}>
          <Ionicons name="trash-outline" size={20} color="white" />
          <Text style={styles.buttonText}>Resetuj historię</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, styles.exportButton]}>
          <Ionicons name="download-outline" size={20} color="white" />
          <Text style={styles.buttonText}>Eksportuj dane</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Lokalizacja</Text>
        
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Region</Text>
            <Text style={styles.settingDescription}>
              Domyślnie: Polska (UTC+1/+2)
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.regionButton}
            onPress={() => Alert.alert(
              'Informacja', 
              'Ta funkcja będzie dostępna w kolejnej aktualizacji. Obecnie używana jest strefa czasowa Polski.'
            )}
          >
            <Text style={styles.regionButtonText}>Polska</Text>
            <Ionicons name="chevron-forward" size={20} color="#555" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>O aplikacji</Text>
        <Text style={styles.versionText}>Wersja aplikacji: 1.0.0</Text>
        <Text style={styles.aboutText}>
          Aplikacja do zarządzania lekami i przypomnieniami o ich zażywaniu.
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  section: {
    backgroundColor: 'white',
    marginVertical: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  settingDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  settingSubLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginVertical: 12,
  },
  soundOptionsContainer: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 10,
  },
  soundOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  soundName: {
    fontSize: 16,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f44336',
    padding: 14,
    borderRadius: 8,
    marginTop: 16,
  },
  exportButton: {
    backgroundColor: '#4a86e8',
    marginTop: 12,
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    marginLeft: 8,
    fontSize: 16,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4a86e8',
    padding: 14,
    borderRadius: 8,
    marginTop: 16,
  },
  versionText: {
    fontSize: 14,
    marginBottom: 10,
  },
  aboutText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  regionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
    backgroundColor: '#f0f0f0',
  },
  regionButtonText: {
    marginRight: 4,
    fontSize: 14,
    color: '#555',
  },
});

export default SettingsScreen;
