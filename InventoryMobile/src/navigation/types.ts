export type ScreenStackParamList = {
    HomeScreen: undefined;
    LoginScreen: undefined;
};

export type MainTabParamList = {

};

declare global {
    namespace ReactNavigation {
        interface RootStackParamList
            extends ScreenStackParamList {}
    }
}