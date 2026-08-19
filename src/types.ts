// types.ts

// -----------------------------
// Cloudflare Bindings
// -----------------------------
export type CloudflareBindings = {
    shopping_list: D1Database;
    SUPABASE_URL: string;
    SUPABASE_SERVICE_KEY: string;
    SUPABASE_BUCKET: string;
};

// -----------------------------
// User types
// -----------------------------
export type NewUser = {
    email: string;
    first_name: string;
    last_name: string;
    password: string;
};

export type LoginUser = {
    email: string;
    password: string;
};

export type DBUser = {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    password_hash: string;
};

// -----------------------------
// Product types
// -----------------------------
export type Product = {
    id: number;
    name: string;
    price: number;
    category: string;
    store: string;
    description: string;
    barcode: string;
    image_url: string;
    country: string;
    currency : string
};

// -----------------------------
// Update product form
// -----------------------------
export type UpdateProductForm = {
    name: string;
    price: string;
    category: string;
    store: string;
    description: string;
    barcode: string;
    image?: File | null;
};

// -----------------------------
// Shopping list types
// -----------------------------
export type UserList = {
    user_id: number;
    list: number[]; // array of product IDs
};

export type UpdateListBody = {
    user_id: number;
    list: number[];
};

// -----------------------------
// Get-my-list-items
// -----------------------------
export type GetMyListItemsBody = {
    idList: number[];
    currentStore?: string;
};

// -----------------------------
// Barcode lookup
// -----------------------------
export type BarcodeLookup = {
    barcode: string;
};

export type User_List = {
    user_id: number,
    list: string,
    favorites: string
}