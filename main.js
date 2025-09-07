import { createWorker } from "tesseract.js"
import { createServer } from "node:http"
import { readFileSync } from "fs"

class nutrient {
    constructor(expression, caution, unit, daily) {
        this.expression = expression
        this.caution = caution
        this.unit = unit
        this.daily = daily
    }
}

class unit {
    constructor(short, long) {
        this.short = short
        this.long = long
    }
}

class ingredient {
    constructor(ingredient, type, score) {
        this.ingredient = ingredient
        this.type = type
        this.score = score
    }
}

const g = new unit("g", "grams")
const mg = new unit("mg", "milligrams")
const cal = new unit("cal", "calories")
//const n = new unit()

const nutrition = {
    //"Serving size": new nutrient(/per[\do\/]*\w+\(([\w\.]+)\)/, n, false),
    "Protein": new nutrient(/protéines([\do\.]+)g/, false, g, 55),
    "Calcium": new nutrient(/calcium([\do.]+)mg/, false, mg, 1300),
    "Iron": new nutrient(/fer([\do.]+)mg/, false, mg, 8),
    "Vitamin C": new nutrient(/vitaminec([\do.]+)mg/, false, mg, 75),
    "Fibre": new nutrient(/fibres([\do.]+)g/, false, g, 30),
    "Calories": new nutrient(/calories([\do]+)/, true, cal, 2000),
    "Carbohydrates": new nutrient(/glucides([\do.]+)g/, true, g, 225),
    "Sugar": new nutrient(/sucres([\do.]+)g/, true, g, 36),
    "Fat": new nutrient(/lipides([\do\.]+)g/, true, g, 44),
    "Saturated Fat": new nutrient(/saturés([\do\.]+)g/, true, g, 30),
    "Trans Fat": new nutrient(/trans([\do\.]+)g/, true, g, 2.2),
    "Cholesterol": new nutrient(/cholestér[ona]l([\do\.]+)mg/, true, mg, 300),
    "Sodium": new nutrient(/sodium([\do\.]+)mg/, true, mg, 2000),
}

const ingredients = {
    "potential allergen": [
        "milk", "eggs", "peanuts", "tree nuts", "soy", "wheat", "fish", "shellfish",
        "gluten", "mustard", "celery", "lupin", "mollusks", "corn", "kiwi", "tomatoes", "peas", "paprika", "sesame seeds"
    ],
    "artifical preservative": [
        "sulfites", "monosodium glutamate", "butylated hydroxyanisole", "tertiary butylhydroquinone"
    ],
    "artificial flavor": [
        "artificial flavors", "vanillin", "ethyl maltol"
    ],
    "artificial color": [
        "artificial colors", "red 40", "yellow 5", "blue 1"
    ],
    "added sugar": [
        "corn syrup", "glucose syrup", "malt syrup", "molasses"
    ]
};  

async function getFacts(fileName) {
    const worker = await createWorker("eng")
    const ret = await worker.recognize(fileName)
    await worker.terminate()
    const data = ret.data.text.toLowerCase().replace(/ /g, "")
    //console.log(data)
    const nutrients = {}
    const containsingredients = []
    const facts = {
        "nutrients": nutrients,
        "ingredients": containsingredients
    }
    for (let nutrient in nutrition) {
        const match = data.match(nutrition[nutrient].expression)
        nutrients[nutrient]= match ? match[1].replace("o", "0") : null
    }
    for (let ingredienttype in ingredients) {
        for (let currentingredient of ingredients[ingredienttype]) {
            if (data.match(currentingredient.replace(/ /g, ""))) {
                containsingredients.push(new ingredient(currentingredient, ingredienttype, ingredienttype != "potential allergen" ? 1 : 0))
            }
        }
    }
    return facts
}

const maxnutritionscore = Object.keys(nutrition).length
const basenutritionscore = maxnutritionscore/2

function clamp(n, x, y) {
    return n > y ? y : (n > x ? n : x)
}

async function analyzeFacts(facts) {
    let tips = []
    let nutritionscore = basenutritionscore
    let ingredientsscore = 6
    let nutrientcount = 0
    for (let nutrient in nutrition) {
        const fact = facts["nutrients"][nutrient]
        if (fact == null || !nutrition[nutrient].daily) {
            continue
        }
        const nutrientvalue = nutrition[nutrient]
        nutritionscore += fact / nutrientvalue.daily * (nutrientvalue.caution ? -1: 1)
        if (fact > nutrientvalue.daily * 0.15) {
            if (!nutrientvalue.caution) {
                nutrientcount++
            }
            tips.push(`${nutrientvalue.caution ? "⚠️" : "⭐"}   Contains high ${nutrient}: ${fact} ${nutrientvalue.unit.long}`)
        }
    }
    for (let ingredient of facts["ingredients"]) {
        ingredientsscore -= ingredient.score
        tips.push(`⚠️   Contains ${ingredient.type} ${ingredient.ingredient}`)
    }
    if (nutrientcount < 2) {
        tips.push("This food contains a low number of significant nutrients, consider a food with greater nutritional value")
    }
    tips.push(`Overall nutrition score: ${clamp(Math.floor(nutritionscore / maxnutritionscore * 100), 0, 100)}%`)
    tips.push(`Overall ingredients score: ${clamp(Math.floor(ingredientsscore / 6 * 100), 0, 100)}%`)
    let out = ""
    tips.forEach((e) => {
        out += e + "\n"
    })
    return out.trim()
}

async function analyzeImage(image) {
    const facts = await getFacts(image)
    const analysis = await analyzeFacts(facts)
    return analysis
}

const hostname = "0.0.0.0"
const port = 8080
const page = readFileSync("index.html").toString()

const server = createServer((req, res) => {
    try {
        res.setHeader("Access-Control-Allow-Origin", "null")
        res.setHeader("Access-Control-Allow-Headers", "content-type")
        res.setHeader("Content-Type", "text/html")
        res.statusCode = 200
        if (req.method == "POST") {
            console.log("POST")
            let body = ""
            req.on("data", (data) => {
                body += data
            })
            req.on("end", async () => {
                const result = await analyzeImage(body)
                res.end(result)
            })
        } else {
            res.end(page)
        }
    } catch (err) {
        console.log(err)
    }
})

server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});


/*(async () => {
    const facts = await getFacts("test5.jpg")
    //console.log(facts)
    const tips = await analyzeFacts(facts)
    console.log(tips)
})()*/