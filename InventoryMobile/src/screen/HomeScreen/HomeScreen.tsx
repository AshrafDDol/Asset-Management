import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';

import { StackNavigationProp } from '@react-navigation/stack';
import { ScreenStackParamList } from '../../navigation/types';

type HomeScreenNavigationProp = StackNavigationProp<ScreenStackParamList, 'HomeScreen'>;

interface HomeScreenProps {
    navigation: HomeScreenNavigationProp
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
    return(
        <View style={styles.container}>
            <Text style={styles.title}>AMS Handheld</Text>
            <Pressable style={styles.workArea} onPress={() => navigation.navigate('WorkQueueScreen')}><Text style={styles.workTitle}>Lifecycle Work Queue</Text><Text>Processing, Return and Swap</Text></Pressable>
            <Pressable style={styles.workArea} onPress={() => navigation.navigate('StockTakeQueueScreen')}><Text style={styles.workTitle}>Stock Take</Text><Text>Location audit and RFID counting</Text></Pressable>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, padding: 18, gap: 14 },
    title: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
    workArea: { borderWidth: 1, borderColor: '#aaa', borderRadius: 8, padding: 18, gap: 4 },
    workTitle: { fontSize: 18, fontWeight: '700', color: '#1f6feb' },
});

export default HomeScreen;
