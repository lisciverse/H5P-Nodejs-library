import { ContentId } from '../../src/types';

let mockData;
const mock = jest.fn().mockImplementation(() => {
    return {
        deleteContentUserDataByUserId: jest.fn().mockImplementation(() => {
            return;
        }),
        deleteAllContentUserDataByContentId: jest
            .fn()
            .mockImplementation(() => {
                return;
            }),
        loadContentUserData: jest.fn().mockImplementation(() => {
            return 'this is some data';
        }),
        saveContentUserData: jest.fn().mockImplementation(() => {
            return;
        }),
        saveFinishedDataForUser: jest.fn().mockImplementation(() => {
            return;
        }),
        setMockData: (m) => (mockData = m),
        listByContent: jest
            .fn()
            .mockImplementation((contentId: ContentId, userId: string) => {
                return (
                    mockData || [
                        {
                            contentId,
                            userId,
                            dataType: 'state',
                            subContentId: '0',
                            userState: `${contentId}-${userId}`,
                            preload: true
                        }
                    ]
                );
            })
    };
});

export default mock;