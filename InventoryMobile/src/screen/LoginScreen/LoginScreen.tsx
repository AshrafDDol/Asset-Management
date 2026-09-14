import React from 'react';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { login } from '../../api/auth';
import { apiErrorMessage } from '../../api/client';
import { ScreenStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ScreenStackParamList, 'LoginScreen'>;

export const LoginScreen: React.FC<Props> = ({ navigation }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        setLoading(true);
        setError(null);
        try {
            await login(username, password);
            navigation.replace('WorkQueueScreen');
        } catch (reason) {
            setError(apiErrorMessage(reason));
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Asset Management Test</Text>
            <TextInput autoCapitalize="none" placeholder="Username or email" value={username} onChangeText={setUsername} style={styles.input} />
            <TextInput secureTextEntry placeholder="Password" value={password} onChangeText={setPassword} style={styles.input} />
            {error && <Text style={styles.error}>{error}</Text>}
            <Pressable disabled={loading || !username.trim() || !password} onPress={submit} style={styles.button}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign In</Text>}
            </Pressable>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
    title: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
    input: { borderWidth: 1, borderColor: '#999', borderRadius: 4, padding: 12 },
    button: { backgroundColor: '#1f6feb', padding: 14, alignItems: 'center' },
    buttonText: { color: '#fff', fontWeight: '700' },
    error: { color: '#a51d1d' },
});

export default LoginScreen;
