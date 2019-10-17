import { ReadStream } from 'fs';
import fsExtra from 'fs-extra';
import globPromise from 'glob-promise';
import path from 'path';
import promisepipe from 'promisepipe';

import { Stream } from 'stream';
import {
    ContentId,
    IContentMetadata,
    IContentStorage,
    IUser,
    Permission
} from '../../src/types';

/**
 * Persists content to the disk.
 */
export default class FileContentStorage implements IContentStorage {
    /**
     * @param {string} contentPath The absolute path to the directory where the content should be stored
     */
    constructor(private contentPath: string) {}

    /**
     * Returns a random integer
     * @param {number} min The minimum
     * @param {number} max The maximum
     * @returns {number} a random integer
     */
    private static getRandomInt(min: number, max: number): number {
        const finalMin = Math.ceil(min);
        const finalMax = Math.floor(max);
        return Math.floor(Math.random() * (finalMax - finalMin + 1)) + finalMin;
    }

    /**
     * Adds a content file to an existing content object. The content object has to be created with createContent(...) first.
     * @param {ContentId} id The id of the content to add the file to
     * @param {string} filename The filename INSIDE the content folder
     * @param {Stream} stream A readable stream that contains the data
     * @param {User} user The user who owns this object
     * @returns {Promise<void>}
     */
    public async addContentFile(
        id: ContentId,
        filename: string,
        stream: Stream,
        user: IUser
    ): Promise<void> {
        if (
            !(await fsExtra.pathExists(
                path.join(this.contentPath, id.toString())
            ))
        ) {
            throw new Error(
                `Cannot add file ${filename} to content with id ${id}: Content with this id does not exist.`
            );
        }

        const fullPath = path.join(
            this.contentPath,
            id.toString(),
            'content',
            filename
        );
        await fsExtra.ensureDir(path.dirname(fullPath));
        const writeStream = fsExtra.createWriteStream(fullPath);
        await promisepipe(stream, writeStream);
    }

    /**
     * Checks if a piece of content exists in storage.
     * @param contentId the content id to check
     * @returns true if the piece of content exists
     */
    public async contentExists(contentId: ContentId): Promise<boolean> {
        return fsExtra.pathExists(
            path.join(this.contentPath, contentId.toString())
        );
    }

    /**
     * Creates a content object in the repository. Add files to it later with addContentFile(...).
     * Throws an error if something went wrong. In this case no traces of the content are left in storage and all changes are reverted.
     * @param {any} metadata The metadata of the content (= h5p.json)
     * @param {any} content the content object (= content/content.json)
     * @param {User} user The user who owns this object.
     * @param {ContentId} id (optional) The content id to use
     * @returns {Promise<ContentId>} The newly assigned content id
     */
    public async createContent(
        metadata: IContentMetadata,
        content: any,
        user: IUser,
        id?: ContentId
    ): Promise<ContentId> {
        if (id === undefined || id === null) {
            // tslint:disable-next-line: no-parameter-reassignment
            id = await this.createContentId();
        }
        try {
            await fsExtra.ensureDir(path.join(this.contentPath, id.toString()));
            await fsExtra.ensureDir(
                path.join(this.contentPath, id.toString(), 'content')
            );
            await fsExtra.writeJSON(
                path.join(this.contentPath, id.toString(), 'h5p.json'),
                metadata
            );
            await fsExtra.writeJSON(
                path.join(
                    this.contentPath,
                    id.toString(),
                    'content',
                    'content.json'
                ),
                content
            );
        } catch (error) {
            await fsExtra.remove(path.join(this.contentPath, id.toString()));
            throw new Error(`Could not create content: ${error.message}`);
        }
        return id;
    }

    /**
     * Generates a unique content id that hasn't been used in the system so far.
     * @returns {Promise<ContentId>} A unique content id
     */
    public async createContentId(): Promise<ContentId> {
        let counter = 0;
        let id;
        let exists = false;
        do {
            id = FileContentStorage.getRandomInt(1, 2 ** 32);
            counter += 1;
            const p = path.join(this.contentPath, id.toString());
            exists = await fsExtra.pathExists(p);
        } while (exists && counter < 5); // try 5x and give up then
        if (exists) {
            throw new Error('Could not generate id for new content.');
        }
        return id;
    }

    /**
     * Deletes content from the repository.
     * Throws errors if something goes wrong.
     * @param {ContentId} id The content id to delete.
     * @param {User} user The user who wants to delete the content
     * @returns {Promise<void>}
     */
    public async deleteContent(id: ContentId, user?: IUser): Promise<void> {
        if (
            !(await fsExtra.pathExists(
                path.join(this.contentPath, id.toString())
            ))
        ) {
            throw new Error(
                `Cannot delete content with id ${id}: It does not exist.`
            );
        }

        await fsExtra.remove(path.join(this.contentPath, id.toString()));
    }

    /**
     * Gets the filenames of files added to the content with addContentFile(...) (e.g. images, videos or other files)
     * @param contentId the piece of content
     * @param user the user who wants to access the piece of content
     * @returns a list of files that are used in the piece of content (does not include the content directory!), e.g. ['image1.png', 'video2.mp4']
     */
    public async getContentFiles(
        contentId: ContentId,
        user: IUser
    ): Promise<string[]> {
        const contentDirectoryPath = path.join(
            this.contentPath,
            contentId.toString(),
            'content'
        );
        const absolutePaths = await globPromise(
            path.join(contentDirectoryPath, '**', '*.*'),
            {
                ignore: [path.join(contentDirectoryPath, 'content.json')],
                nodir: true
            }
        );
        return absolutePaths.map(p => path.relative(contentDirectoryPath, p));
    }

    /**
     * Returns a readable stream of a content file (e.g. image or video) inside a piece of content
     * @param {ContentId} id the id of the content object that the file is attached to
     * @param {string} filename the filename of the file to get (you have to add the "content/" directory if needed)
     * @param {User} user the user who wants to retrieve the content file
     * @returns {Stream}
     */
    public getContentFileStream(
        id: ContentId,
        filename: string,
        user: IUser
    ): ReadStream {
        return fsExtra.createReadStream(
            path.join(this.contentPath, id.toString(), filename)
        );
    }

    /**
     * Returns an array of permissions that the user has on the piece of content
     * @param contentId the content id to check
     * @param user the user who wants to access the piece of content
     */
    public async getUserPermissions(
        contentId: ContentId,
        user: IUser
    ): Promise<Permission[]> {
        return [
            Permission.Delete,
            Permission.Download,
            Permission.Edit,
            Permission.Embed,
            Permission.View
        ];
    }
}