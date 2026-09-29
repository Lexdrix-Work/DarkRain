import * as THREE from 'three';

export default class CityGenerator {
    constructor(config = {}) {
        this.width = config.width || 500;
        this.height = config.height || 500;
        this.density = config.density || 0.1;
        this.minBuildingSize = config.minBuildingSize || 3;
        this.maxBuildingSize = config.maxBuildingSize || 6;
        this.buildingTypes = config.buildingTypes || ['residential', 'commercial', 'industrial'];
        this.anomalyChance = config.anomalyChance || 0.05;
        this.scene = config.scene;
        
        this._cityObjects = [];
        this._buildings = [];
        this._roads = [];
        this._blocks = [];
    }

    generateCity() {
        const cityData = {
            width: this.width,
            height: this.height,
            blockSize: 30,
            roadWidth: 6,
            blocks: [],
            roads: [],
            buildings: []
        };

        const blocksX = Math.floor(this.width / (cityData.blockSize + cityData.roadWidth));
        const blocksZ = Math.floor(this.height / (cityData.blockSize + cityData.roadWidth));

        const totalWidth = blocksX * cityData.blockSize + (blocksX + 1) * cityData.roadWidth;
        const totalDepth = blocksZ * cityData.blockSize + (blocksZ + 1) * cityData.roadWidth;
        const startX = -totalWidth / 2 + cityData.roadWidth;
        const startZ = -totalDepth / 2 + cityData.roadWidth;

        // Generate blocks
        for (let bx = 0; bx < blocksX; bx++) {
            for (let bz = 0; bz < blocksZ; bz++) {
                const blockX = startX + bx * (cityData.blockSize + cityData.roadWidth) + cityData.blockSize / 2;
                const blockZ = startZ + bz * (cityData.blockSize + cityData.roadWidth) + cityData.blockSize / 2;

                const block = {
                    x: blockX,
                    z: blockZ,
                    width: cityData.blockSize,
                    depth: cityData.blockSize,
                    buildings: []
                };

                // Generate buildings within block
                const buildingsPerSide = Math.floor(cityData.blockSize / this.maxBuildingSize);
                const spacing = cityData.blockSize / buildingsPerSide;

                for (let ix = 0; ix < buildingsPerSide; ix++) {
                    for (let iz = 0; iz < buildingsPerSide; iz++) {
                        // Random chance to skip (create gaps/parks)
                        if (Math.random() < 0.15) continue;

                        const localX = blockX - cityData.blockSize / 2 + spacing * (ix + 0.5);
                        const localZ = blockZ - cityData.blockSize / 2 + spacing * (iz + 0.5);

                        const buildingWidth = this.minBuildingSize + Math.random() * (this.maxBuildingSize - this.minBuildingSize);
                        const buildingDepth = this.minBuildingSize + Math.random() * (this.maxBuildingSize - this.minBuildingSize);
                        const floors = 1 + Math.floor(Math.random() * 12);
                        const floorHeight = 3;

                        const building = {
                            x: localX,
                            z: localZ,
                            width: buildingWidth,
                            depth: buildingDepth,
                            height: floors * floorHeight,
                            floors: floors,
                            type: this.buildingTypes[Math.floor(Math.random() * this.buildingTypes.length)],
                            hasAnomaly: Math.random() < this.anomalyChance
                        };

                        block.buildings.push(building);
                        cityData.buildings.push(building);
                        this._buildings.push(building);
                    }
                }

                cityData.blocks.push(block);
                this._blocks.push(block);
            }
        }

        // Generate road data
        // Horizontal roads
        for (let bz = 0; bz <= blocksZ; bz++) {
            const roadZ = startZ - cityData.roadWidth / 2 + bz * (cityData.blockSize + cityData.roadWidth);
            cityData.roads.push({
                type: 'horizontal',
                x: 0,
                z: roadZ,
                width: totalWidth,
                depth: cityData.roadWidth
            });
        }

        // Vertical roads
        for (let bx = 0; bx <= blocksX; bx++) {
            const roadX = startX - cityData.roadWidth / 2 + bx * (cityData.blockSize + cityData.roadWidth);
            cityData.roads.push({
                type: 'vertical',
                x: roadX,
                z: 0,
                width: cityData.roadWidth,
                depth: totalDepth
            });
        }

        this._roads = cityData.roads;

        console.log(`CityGenerator: Generated ${cityData.buildings.length} buildings, ${cityData.roads.length} roads`);

        return cityData;
    }

    getBuildingData() {
        return this._buildings;
    }

    getRoadData() {
        return this._roads;
    }

    getBlockData() {
        return this._blocks;
    }

    dispose() {
        this._buildings = [];
        this._roads = [];
        this._blocks = [];
        this._cityObjects = [];
    }
}