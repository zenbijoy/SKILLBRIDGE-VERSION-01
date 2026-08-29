import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, MapPressEvent } from 'react-native-maps';

interface MapPickerProps {
  onLocationSelect: (location: string) => void;
}

export default function MapPicker({ onLocationSelect }: MapPickerProps) {
  const [marker, setMarker] = useState<{ latitude: number; longitude: number } | null>(null);

  const handlePress = (e: MapPressEvent) => {
    const coords = e.nativeEvent.coordinate;
    setMarker(coords);
    onLocationSelect(`${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`);
  };

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: 40.7128,
          longitude: -74.0060,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        onPress={handlePress}
      >
        {marker && <Marker coordinate={marker} />}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 180,
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  map: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
