import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface MapPickerProps {
  onLocationSelect: (location: string) => void;
}

export default function MapPicker({ onLocationSelect }: MapPickerProps) {
  return (
    <View style={styles.container}>
      <MaterialCommunityIcons name="map-marker-off" size={32} color="#9CA3AF" />
      <Text style={styles.text}>Interactive Map is only available on the mobile app.</Text>
      <Text style={styles.subText}>Please type the location manually above.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 120,
    width: '100%',
    borderRadius: 8,
    marginTop: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  text: {
    marginTop: 8,
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '600',
  },
  subText: {
    marginTop: 4,
    fontSize: 12,
    color: '#6B7280',
  },
});
