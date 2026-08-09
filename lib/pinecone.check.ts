import {upsertVectors, searchSimilar} from "./pinecone";
import {embed} from "./embeddings"

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });


(async () => {
    const cooking = `Cooking is the art of making food ready to eat using heat. You mix fresh ingredients like vegetables, meat, and spices in a pan or pot. When you apply heat, the food changes color, becomes soft, and develops rich flavors. It is a fun way to feed your body and share a meal with family and friends.`;
    const carEngines = `A car engine is the power heart of a vehicle. It burns a mix of fuel and air inside small spaces called cylinders to create tiny explosions. These explosions push metal parts called pistons up and down. This movement turns the wheels and makes the car move forward on the road.`;
    
    const cookingVector = await embed(cooking);
    const carVector = await embed(carEngines);

    await upsertVectors([
        {id: "A", values: cookingVector, metadata: {topic: "cooking"}},
        {id: "B", values: carVector, metadata: {topic: "car Engines"}},
    ]);

    const query = "How do I prepare a delicious dinner?";
    const queryVector = await embed(query);

    const result = await searchSimilar(queryVector, 2);
    console.log(result);
})();

