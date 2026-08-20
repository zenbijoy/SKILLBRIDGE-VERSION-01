import { useRouter } from "expo-router";
export declare function registerPush(): Promise<string | null>;
export declare function unregisterPush(): Promise<void>;
export declare function useNotificationRouting(router: ReturnType<typeof useRouter>): void;
