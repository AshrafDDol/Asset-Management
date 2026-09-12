export type ScreenStackParamList = {
    HomeScreen: undefined;
    LoginScreen: undefined;
    RFIDDiagnosticScreen: undefined;
};

export type MainTabParamList = {

};

declare global {
    namespace ReactNavigation {
        interface RootStackParamList
            extends ScreenStackParamList {}
    }
}
