import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { StackNavigationProp } from '@react-navigation/stack';
import { ScreenStackParamList } from '../../navigation/types';

type HomeScreenNavigationProp = StackNavigationProp<ScreenStackParamList, 'HomeScreen'>;

interface HomeScreenProps {
    navigation: HomeScreenNavigationProp
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
    return(
        <View style={styles.container}>
            <Text>HomeScreen</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {},
});

export default HomeScreen;