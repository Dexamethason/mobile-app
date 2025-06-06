# MediReminder - Aplikacja do zarządzania lekami 💊

## Opis projektu

MediReminder to aplikacja mobilna przypominająca o zażywaniu leków. Pozwala na efektywne zarządzanie harmonogramem dawkowania, wysyłanie powiadomień o konieczności zażycia leków oraz śledzenie historii przyjmowania lekarstw.

## Funkcjonalności

- Dodawanie leków z możliwością ustawienia dawkowania
- Planowanie regularnych lub jednorazowych dawek
- System powiadomień przypominających o zażyciu leków
- Przeglądanie historii zażytych leków
- Kalendarz z oznaczeniami statusu dawkowania

## Technologie

- React Native 0.76.7
- TypeScript
- Expo 52.0.0
- AsyncStorage - przechowywanie danych
- Expo Notifications - obsługa powiadomień
- React Navigation - nawigacja między ekranami

## Instalacja

```bash
# Instalacja
npm install

# Uruchomienie
npm start
```

## Struktura aplikacji

- **screens/** - Główne ekrany aplikacji:
  - AddEditMedicineScreen - Dodawanie/edycja leków
  - HistoryScreen - Historia zażywania leków
  - MedicineDetailsScreen - Szczegóły leku
  - MedicinesListScreen - Lista wszystkich leków
  - RemindersScreen - Przypomnienia o lekach
  - SettingsScreen - Ustawienia aplikacji

- **utils/** - Funkcje pomocnicze:
  - dateUtils - Funkcje do obsługi dat
  - historyService - Serwis zarządzający historią zażycia leków
  - notifications - Obsługa powiadomień

## Autorzy

Projekt został wykonany w ramach przedmiotu "Programowanie aplikacji mobilnych" przez:

- Jakub Rogula
- Bartłomiej Prześlak
- Daniel Koćma 

---

