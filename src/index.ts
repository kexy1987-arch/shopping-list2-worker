import { Hono } from "hono";
import { cors } from "hono/cors";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import type {
  CloudflareBindings,
  DBUser,
  Product,
  User_List
} from "./types";

const app = new Hono<{ Bindings: CloudflareBindings }>();

// -----------------------------
// CORS
// -----------------------------
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return "null";
      if (origin.startsWith("http://localhost")) return origin;
      if (origin.startsWith("http://127.0.0.1")) return origin;
      if (origin.startsWith("http://192.168.")) return origin;
      if (origin.endsWith(".local:5173")) return origin;
      if (origin === "https://shopping-list2.pages.dev") return origin;
      return "null";
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

// -----------------------------
// Test route
// -----------------------------
app.get("/message", (c) => {
  return c.json({ message: "Hello Shopping List!" });
});

// -----------------------------
// Update or insert product
// -----------------------------
app.post("/update-product", async (c) => {
  const form = await c.req.formData();

  const id = form.get("id")?.toString() || null;
  const name = form.get("name")?.toString();
  const price = form.get("price")?.toString();
  const category = form.get("category")?.toString();
  const store = form.get("store")?.toString();
  const description = form.get("description")?.toString();
  const barcode = form.get("barcode")?.toString();
  const image = form.get("image") as File | null;
  const country = form.get("country");

  const item = await c.env.shopping_list
    .prepare("SELECT * FROM products WHERE id = ?")
    .bind(id)
    .first<Product>();

  const supabase = createClient(
    c.env.SUPABASE_URL,
    c.env.SUPABASE_SERVICE_KEY
  );

  const ext = image?.name.split(".").pop() || "jpg";
  const fileName = `${name}-${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const imageUrl =
    `https://isdtokzfuppyibdyevtu.supabase.co/storage/v1/object/public/white-stone-userimg/${fileName}`;

  // UPDATE
  if (item) {
    await c.env.shopping_list
      .prepare(
        "UPDATE products SET name = ?, price = ?, category = ?, description = ?, country = ? WHERE barcode = ?"
      )
      .bind(name, price, category, description, barcode, country)
      .run();

    if (image) {
      const oldUrl = item.image_url;
      const oldFileName = oldUrl.split("/").pop();

      const { error } = await supabase.storage
        .from(c.env.SUPABASE_BUCKET)
        .upload(oldFileName!, image, {
          contentType: `image/${ext}`,
          upsert: true,
        });

      if (error) {
        return c.json({ ok: false, message: "IMAGE_UPLOAD_FAILED", error });
      }
    }

    return c.json({ ok: true, message: "ITEM_UPDATED" });
  }

  // INSERT
  try {
    await c.env.shopping_list
      .prepare(
        "INSERT INTO products(name, price, category, store, description, barcode, image_url, country) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(name, price, category, store, description, barcode, imageUrl, country)
      .run();

    if (image) {
      await supabase.storage
        .from(c.env.SUPABASE_BUCKET)
        .upload(fileName, image, {
          contentType: `image/${ext}`,
        });
    }

    return c.json({ ok: true, message: "Product added to the global list." });
  } catch (err) {
    console.log(err);
    return c.json({ ok: false, message: "Something went wrong" }, 500);
  }
});

// -----------------------------
// Get all products
// -----------------------------
app.get("/get-products", async (c) => {
  try {
    const products = await c.env.shopping_list
      .prepare("SELECT * FROM products")
      .run();

    return c.json({ ok: true, list: products.results });
  } catch (err) {
    console.log(err);
    return c.json({ ok: false }, 500);
  }
});

// -----------------------------
// Create new account
// -----------------------------
app.post("/newacc", async (c) => {
  const { email, first_name, last_name, password, country } = await c.req.json();

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await c.env.shopping_list
      .prepare(
        "INSERT INTO users(email, first_name, last_name, password_hash, country) VALUES (?, ?, ?, ?, ?)"
      )
      .bind(email, first_name, last_name, passwordHash, country)
      .run();

    return c.json({ ok: true, message: "Account successfully created!" });
  } catch (err) {
    console.log(err);
    const message = String(err);

    if (message.includes("UNIQUE constraint failed")) {
      return c.json({ ok: false, error: "USER_EXISTS" });
    }

    return c.json({ ok: false, error: err });
  }
});

// -----------------------------
// Login
// -----------------------------
app.post("/login", async (c) => {
  const { email, password } = await c.req.json();

  try {
    const selectedUser = await c.env.shopping_list
      .prepare(
        "SELECT id, email, first_name, last_name, password_hash, country FROM users WHERE email = ?"
      )
      .bind(email)
      .first<DBUser>();

    if (!selectedUser) {
      return c.json({ ok: false, error: "USER_NOT_EXIST" }, 404);
    }

    const isValid = await bcrypt.compare(password, selectedUser.password_hash);

    if (!isValid) {
      return c.json({ ok: false, error: "INVALID_PASSWORD" }, 401);
    }

    const token = selectedUser.first_name;


    return c.json({ ok: true, user: selectedUser, token });
  } catch (err) {
    console.log(err);
    return c.json({ ok: false, error: "UNKNOWN_ERROR" }, 500);
  }
});

// -----------------------------
// Get user's list
// -----------------------------
app.post("/my-list", async (c) => {
  const userId = await c.req.json();

  const myList = await c.env.shopping_list
    .prepare("SELECT list FROM user_list WHERE user_id = ?")
    .bind(userId)
    .first();

  if (!myList) {
    return c.json({ ok: false, message: "LIST_NOT_EXISTS" }, 404);
  }

  return c.json({ ok: true, data: myList }, 200);
});

// -----------------------------
// Update user's list
// -----------------------------
app.post("/update-list", async (c) => {
  const { user_id, list } = await c.req.json();

  const listString = JSON.stringify(list);

  const myList = await c.env.shopping_list
    .prepare("SELECT list FROM user_list WHERE user_id = ?")
    .bind(user_id)
    .first();

  try {
    if (myList) {
      await c.env.shopping_list
        .prepare("UPDATE user_list SET list = ? WHERE user_id = ?")
        .bind(listString, user_id)
        .run();

      return c.json({ ok: true, message: "LIST_UPDATED" });
    }

    await c.env.shopping_list
      .prepare("INSERT INTO user_list (user_id, list) VALUES (?, ?)")
      .bind(user_id, listString)
      .run();

    return c.json({ ok: true, message: "LIST_CREATED" });
  } catch (error) {
    console.log(error);
    return c.json({ ok: false, message: "SERVER_ERROR", error }, 500);
  }
});

// -----------------------------
// Get stores
// -----------------------------
app.get("/getstores", async (c) => {
  try {
    const stores = await c.env.shopping_list
      .prepare("SELECT DISTINCT store FROM products")
      .run();

    return c.json({ ok: true, stores: stores.results });
  } catch (error) {
    return c.json({ ok: false, error }, 500);
  }
});

// -----------------------------
// Get items by ID list
// -----------------------------
app.post("/get-my-list-items", async (c) => {
  const { idList, currentStore } = await c.req.json();

  if (!idList || idList.length === 0) {
    return c.json({ ok: true, data: [] });
  }

  const placeholders = idList.map(() => "?").join(", ");
  let query = "";
  const params: any[] = [...idList];

  if (!currentStore || currentStore === "all") {
    query = `SELECT * FROM products WHERE id IN (${placeholders})`;
  } else {
    query = `SELECT * FROM products WHERE id IN (${placeholders}) AND store = ?`;
    params.push(currentStore);
  }

  try {
    const row = await c.env.shopping_list.prepare(query).bind(...params).run();
    return c.json({ ok: true, data: row.results });
  } catch (error) {
    console.log(error);
    return c.json({ ok: false, error, message: "Something went wrong." }, 500);
  }
});

// -----------------------------
// Get item by barcode
// -----------------------------
app.post("/getitembybarcode", async (c) => {
  const barcode = await c.req.text();

  try {
    const items = await c.env.shopping_list
      .prepare("SELECT * FROM products WHERE barcode = ?")
      .bind(barcode)
      .all();

    if (!items) {
      return c.json({ ok: true, message: "NO_ITEM_FOUND" }, 404);
    }

    return c.json({ ok: true, message: "ITEM_FOUND", items: items.results });
  } catch (error) {
    console.log(error);
    return c.json({ ok: false, message: "INTERNAL_SERVER_ERROR", error }, 500);
  }
});

//------------------------
//Add to favorites
//------------------------

app.post("/addToFavorites", async (c) => {
  const body = await c.req.json();
  const { productId, userId } = body;
  console.log(body)

  try{
    const row = await c.env.shopping_list
      .prepare("SELECT favorites FROM user_list WHERE user_id = ?")
      .bind(userId)
      .first<User_List>()
    
    if(row){
      const currentList: number[] = row.favorites ? JSON.parse(row.favorites) : [];
      const exist = currentList.find(id => id === productId)
      if(exist) {
        return c.json({ok: true, message: "ALREADY_IN_THE_LIST"}, 409)
      }
      const list = [...currentList, productId];
      const listString = JSON.stringify(list)

      await c.env.shopping_list
        .prepare("UPDATE user_list SET favorites = ? WHERE user_id =? ")
        .bind(listString, userId)
        .run()

      return c.json({ ok: true, message: "FAVORITES_UPDATED" }, 200)
    }

    
  } catch(error) {
    console.log(error)
    return c.json({ok: false, error: error}, 500)
  }  
})

//-----------------------
// Remove from favorite
//-----------------------

app.post("removeFavorite", async (c) => {
  const { userId, productId } = await c.req.json();

  try{
    const favsRow = await c.env.shopping_list
      .prepare("SELECT favorites FROM user_list WHERE user_id = ?")
      .bind(userId)
      .first<User_List>()

    if (favsRow){
      const favs: number[] = JSON.parse(favsRow.favorites);
      const filtered = favs.filter(fav => fav !== productId);
      const favsStr = JSON.stringify(filtered)

      await c.env.shopping_list
        .prepare("UPDATE user_list SET favorites = ? WHERE user_id = ?")
        .bind(favsStr, userId)
        .run()

      return c.json({ok: true, message:"PRODUCT_REMOVED_FROM_FAVS"}, 200)
    }
    
    return c.json({ok: false, error: "ROW_NOT_FOUND"}, 404);
  } catch(error) {
    console.log(error)
    return c.json({ok: false, error: "INTERNAL_ERROR"}, 500)
  }
})

//-----------------------
//Get Favorites Products
//-----------------------

app.post("/getFavoriteProducts", async (c) => {
  const userId = await c.req.json();

  try {
    const favIDs = await c.env.shopping_list
      .prepare("SELECT favorites FROM user_list WHERE user_id = ?")
      .bind(userId)
      .first<User_List>()

    if(favIDs){
      const favs: string[] = JSON.parse(favIDs.favorites);
      const placeholders = favs.map(() => "?").join(", ");
      const params: any[] = [...favs];
      const query = `SELECT * FROM products WHERE id IN (${placeholders})`;

      const favProducts = await c.env.shopping_list
        .prepare(query)
        .bind(...params)
        .all()

      const { results } = favProducts

      return c.json({ok: true, results})
    }
    
  }catch(error) {
    console.log(error)
    return c.json({ok: true, error: error}, 500)
  }
})

//----------------------------
// Change user country
//----------------------------

app.post("/updateCountry", async (c) => {
  const {userId, country} = await c.req.json();

  try{
    await c.env.shopping_list
      .prepare("UPDATE users SET country = ? WHERE id = ?")
      .bind(country, userId)
      .run()

    return c.json({ok:true, message: "COUNTRY_UPDATED"}, 200)
  } catch (error) {
    console.log(error);
    return c.json({ok:false}, 500);
  }
})



export default app;
