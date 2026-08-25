import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ScreenStackParamList } from './types';
import LoginScreen from '../screen/LoginScreen/LoginScreen';
import HomeScreen from '../screen/HomeScreen/HomeScreen';

const Stack = createNativeStackNavigator<ScreenStackParamList>();

const AppNavigator: React.FC = () => {
    return (
        <Stack.Navigator>
            <Stack.Screen name="LoginScreen" component={LoginScreen} />
            <Stack.Screen name="HomeScreen" component={HomeScreen} />
        </Stack.Navigator>
    );
};

export default AppNavigator;