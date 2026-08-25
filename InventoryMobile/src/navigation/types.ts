export type ScreenStackParamList = {
    HomeScreen: undefined;
};

export type MainTabParamList = {

};

declare global {
    namespace ReactNavigation {
        interface RootStackParamList
            extends ScreenStackParamList {}
    }
}